// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ParryVault
 * @notice Parry Protocol — Delta-Neutral LP Protection Vault
 * @dev LPs pay a volatility-adjusted premium for Impermanent Loss insurance.
 *      The vault covers IL events beyond a user-defined threshold.
 *      Premium pricing is determined by on-chain realized volatility fed by the
 *      Parry agent via the onchainos market kline endpoint.
 *
 *      Coverage lifecycle:
 *        1. LP calls activateProtection() + pays premium in OKB
 *        2. Parry agent continuously hedges delta via onchainos swap execute
 *        3. If IL exceeds threshold, LP calls claimProtection()
 *        4. Vault pays out min(actualIL - threshold, maxCoverage)
 *
 *      Protection Certificate NFT (ProtectionCert.sol) is minted on activation
 *      and burned on expiry or claim.
 */
contract ParryVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // Structs
    // ─────────────────────────────────────────────────────────────────────────

    struct ProtectionPolicy {
        address lp;                // LP wallet
        address pool;              // Uniswap V3 pool address
        uint256 tokenId;           // Uniswap V3 position NFT token ID
        int24   tickLower;         // position lower tick
        int24   tickUpper;         // position upper tick
        uint128 liquidity;         // initial liquidity snapshot
        uint256 entryPrice;        // price at activation (18 decimals, USD)
        uint256 coverageAmount;    // max IL payout in wei (OKB)
        uint256 threshold;         // IL % below which no payout (bps, e.g. 500 = 5%)
        uint256 premiumPaid;       // total premium paid (wei)
        uint256 premiumPerBlock;   // ongoing premium per block
        uint256 activatedAt;       // block number of activation
        uint256 expiresAt;         // block number of expiry
        uint256 lastPremiumBlock;  // last block premium was collected
        bool    active;
        bool    claimed;
        uint256 certTokenId;       // ProtectionCert NFT token ID
    }

    struct VolatilityState {
        uint256 realizedVol;       // annualized vol in bps (e.g. 8000 = 80%)
        uint256 lastUpdated;       // block number of last update
        uint256 hedgeRatio;        // current hedge ratio in bps (5000=50%, 10000=100%)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Address of the Parry agent wallet (Agentic Wallet via OnchainOS)
    address public agentWallet;

    /// @notice Protection Certificate NFT contract
    address public certContract;

    /// @notice All active policies
    mapping(bytes32 => ProtectionPolicy) public policies;

    /// @notice Policy IDs per LP address
    mapping(address => bytes32[]) public lpPolicies;

    /// @notice Global volatility state per pool (updated by agent)
    mapping(address => VolatilityState) public poolVolatility;

    /// @notice Total capital available for payouts
    uint256 public vaultCapital;

    /// @notice Minimum protection duration in blocks (~1 day at 3s/block)
    uint256 public constant MIN_DURATION_BLOCKS = 28800;

    /// @notice Maximum coverage ratio vs premium (20x)
    uint256 public constant MAX_COVERAGE_MULTIPLIER = 20;

    /// @notice Base premium rate in bps per block (0.00001% per block)
    uint256 public basePremiumBps = 1;

    /// @notice Total premiums collected historically
    uint256 public totalPremiumsCollected;

    /// @notice Total IL claims paid out
    uint256 public totalClaimsPaid;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event ProtectionActivated(
        bytes32 indexed policyId,
        address indexed lp,
        address pool,
        uint256 tokenId,
        uint256 coverageAmount,
        uint256 expiresAt,
        uint256 certTokenId
    );

    event ProtectionClaimed(
        bytes32 indexed policyId,
        address indexed lp,
        uint256 ilAtClaim,
        uint256 payoutAmount
    );

    event ProtectionExpired(bytes32 indexed policyId, address indexed lp);

    event HedgeExecuted(
        bytes32 indexed policyId,
        address pool,
        int256  deltaExposure,
        uint256 hedgeAmount,
        uint256 hedgeRatio
    );

    event VolatilityUpdated(
        address indexed pool,
        uint256 realizedVol,
        uint256 hedgeRatio
    );

    event KillSwitchTriggered(
        bytes32 indexed policyId,
        address indexed lp,
        uint256 ilPercent
    );

    event CapitalDeposited(address indexed provider, uint256 amount);
    event CapitalWithdrawn(address indexed owner, uint256 amount);
    event PremiumCollected(bytes32 indexed policyId, uint256 amount);

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyAgent() {
        require(msg.sender == agentWallet, "PARRY: caller is not agent");
        _;
    }

    modifier policyExists(bytes32 policyId) {
        require(policies[policyId].lp != address(0), "PARRY: policy not found");
        _;
    }

    modifier policyActive(bytes32 policyId) {
        require(policies[policyId].active, "PARRY: policy not active");
        require(block.number <= policies[policyId].expiresAt, "PARRY: policy expired");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor(address _agentWallet) Ownable(msg.sender) {
        agentWallet = _agentWallet;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LP Functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Activate IL protection for a Uniswap V3 position.
     * @param pool         Address of the Uniswap V3 pool
     * @param tokenId      NFT token ID of the LP position
     * @param tickLower    Position lower tick
     * @param tickUpper    Position upper tick
     * @param liquidity    Liquidity snapshot at activation
     * @param entryPrice   Current price at activation (USD, 18 decimals)
     * @param threshold    IL threshold in bps below which no payout (e.g. 200 = 2%)
     * @param durationBlocks  How long protection lasts in blocks
     */
    function activateProtection(
        address pool,
        uint256 tokenId,
        int24   tickLower,
        int24   tickUpper,
        uint128 liquidity,
        uint256 entryPrice,
        uint256 threshold,
        uint256 durationBlocks
    ) external payable nonReentrant {
        require(durationBlocks >= MIN_DURATION_BLOCKS, "PARRY: duration too short");
        require(msg.value > 0, "PARRY: premium required");
        require(pool != address(0), "PARRY: invalid pool");
        require(threshold < 5000, "PARRY: threshold too high"); // max 50%

        // Coverage = premium * max_multiplier
        uint256 coverageAmount = msg.value * MAX_COVERAGE_MULTIPLIER;
        require(coverageAmount <= vaultCapital, "PARRY: insufficient vault capital");

        // Reserve coverage capital
        vaultCapital -= coverageAmount;

        uint256 premiumPerBlock = msg.value / durationBlocks;
        uint256 expiresAt = block.number + durationBlocks;

        bytes32 policyId = keccak256(
            abi.encodePacked(msg.sender, pool, tokenId, block.number)
        );

        // Mint Protection Certificate NFT
        uint256 certTokenId = 0;
        if (certContract != address(0)) {
            certTokenId = IProtectionCert(certContract).mint(
                msg.sender, policyId, pool, tickLower, tickUpper, expiresAt
            );
        }

        policies[policyId] = ProtectionPolicy({
            lp: msg.sender,
            pool: pool,
            tokenId: tokenId,
            tickLower: tickLower,
            tickUpper: tickUpper,
            liquidity: liquidity,
            entryPrice: entryPrice,
            coverageAmount: coverageAmount,
            threshold: threshold,
            premiumPaid: msg.value,
            premiumPerBlock: premiumPerBlock,
            activatedAt: block.number,
            expiresAt: expiresAt,
            lastPremiumBlock: block.number,
            active: true,
            claimed: false,
            certTokenId: certTokenId
        });

        lpPolicies[msg.sender].push(policyId);
        totalPremiumsCollected += msg.value;

        emit ProtectionActivated(
            policyId, msg.sender, pool, tokenId,
            coverageAmount, expiresAt, certTokenId
        );
    }

    /**
     * @notice Claim IL payout when IL exceeds the threshold.
     * @param policyId    The policy to claim against
     * @param currentPrice Current pool price (USD, 18 decimals) — verified by agent
     * @param agentSig    EIP-712 signature from agent wallet confirming IL calculation
     */
    function claimProtection(
        bytes32 policyId,
        uint256 currentPrice,
        uint256 ilBps,
        bytes calldata agentSig
    ) external nonReentrant policyExists(policyId) policyActive(policyId) {
        ProtectionPolicy storage policy = policies[policyId];
        require(msg.sender == policy.lp, "PARRY: not policy owner");
        require(!policy.claimed, "PARRY: already claimed");

        // Verify agent signature on (policyId, currentPrice, ilBps)
        bytes32 msgHash = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparator(),
                keccak256(abi.encode(
                    keccak256("Claim(bytes32 policyId,uint256 currentPrice,uint256 ilBps)"),
                    policyId, currentPrice, ilBps
                ))
            )
        );
        address signer = _recoverSigner(msgHash, agentSig);
        require(signer == agentWallet, "PARRY: invalid agent signature");

        require(ilBps > policy.threshold, "PARRY: IL below threshold");

        // Payout = min((ilBps - threshold) / 10000 * coverageAmount, coverageAmount)
        uint256 excessIlBps = ilBps - policy.threshold;
        uint256 payout = (excessIlBps * policy.coverageAmount) / 10000;
        if (payout > policy.coverageAmount) payout = policy.coverageAmount;

        policy.claimed = true;
        policy.active = false;

        totalClaimsPaid += payout;

        // Burn cert NFT
        if (certContract != address(0) && policy.certTokenId != 0) {
            IProtectionCert(certContract).burnAndSettle(policy.certTokenId);
        }

        (bool sent, ) = payable(policy.lp).call{value: payout}("");
        require(sent, "PARRY: payout failed");

        emit ProtectionClaimed(policyId, policy.lp, ilBps, payout);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Agent Functions (called by Parry agent via onchainos gateway)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Record a hedge execution on-chain for audit + validation score.
     * @dev Called by agent after every onchainos swap execute.
     */
    function recordHedge(
        bytes32 policyId,
        int256  deltaExposure,
        uint256 hedgeAmount,
        uint256 hedgeRatio
    ) external onlyAgent policyExists(policyId) {
        ProtectionPolicy storage policy = policies[policyId];
        require(policy.active, "PARRY: policy not active");

        emit HedgeExecuted(policyId, policy.pool, deltaExposure, hedgeAmount, hedgeRatio);
    }

    /**
     * @notice Update realized volatility for a pool (fed from onchainos market kline).
     * @dev Hedge ratio is automatically scaled: low vol → 50%, high vol → 100%
     */
    function updateVolatility(
        address pool,
        uint256 realizedVolBps
    ) external onlyAgent {
        // Adaptive hedge ratio: linear scale from 5000 (50%) at vol=2000 to 10000 (100%) at vol=8000+
        uint256 hedgeRatio;
        if (realizedVolBps <= 2000) {
            hedgeRatio = 5000;
        } else if (realizedVolBps >= 8000) {
            hedgeRatio = 10000;
        } else {
            hedgeRatio = 5000 + ((realizedVolBps - 2000) * 5000) / 6000;
        }

        poolVolatility[pool] = VolatilityState({
            realizedVol: realizedVolBps,
            lastUpdated: block.number,
            hedgeRatio: hedgeRatio
        });

        emit VolatilityUpdated(pool, realizedVolBps, hedgeRatio);
    }

    /**
     * @notice Kill switch — auto-exit triggered by agent when IL spike detected.
     * @dev Marks policy as claimed with full coverage payout.
     */
    function triggerKillSwitch(
        bytes32 policyId,
        uint256 ilPercent
    ) external onlyAgent policyExists(policyId) policyActive(policyId) {
        ProtectionPolicy storage policy = policies[policyId];
        require(!policy.claimed, "PARRY: already claimed");

        policy.claimed = true;
        policy.active = false;

        uint256 payout = policy.coverageAmount;
        totalClaimsPaid += payout;

        if (certContract != address(0) && policy.certTokenId != 0) {
            IProtectionCert(certContract).burnAndSettle(policy.certTokenId);
        }

        (bool sent, ) = payable(policy.lp).call{value: payout}("");
        require(sent, "PARRY: kill switch payout failed");

        emit KillSwitchTriggered(policyId, policy.lp, ilPercent);
    }

    /**
     * @notice Collect accrued per-block premium from an active policy.
     */
    function collectPremium(bytes32 policyId) external onlyAgent policyExists(policyId) {
        ProtectionPolicy storage policy = policies[policyId];
        require(policy.active, "PARRY: not active");

        uint256 blocksDue = block.number - policy.lastPremiumBlock;
        if (blocksDue == 0) return;

        uint256 amount = blocksDue * policy.premiumPerBlock;
        policy.lastPremiumBlock = block.number;

        emit PremiumCollected(policyId, amount);
        // Premium stays in vault as capital
    }

    /**
     * @notice Expire a policy that has passed its expiry block.
     */
    function expirePolicy(bytes32 policyId) external onlyAgent policyExists(policyId) {
        ProtectionPolicy storage policy = policies[policyId];
        require(block.number > policy.expiresAt, "PARRY: not expired yet");
        require(policy.active, "PARRY: already inactive");

        policy.active = false;

        // Return reserved coverage capital to vault
        if (!policy.claimed) {
            vaultCapital += policy.coverageAmount;
        }

        if (certContract != address(0) && policy.certTokenId != 0) {
            IProtectionCert(certContract).expire(policy.certTokenId);
        }

        emit ProtectionExpired(policyId, policy.lp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Capital Management (owner)
    // ─────────────────────────────────────────────────────────────────────────

    function depositCapital() external payable onlyOwner {
        vaultCapital += msg.value;
        emit CapitalDeposited(msg.sender, msg.value);
    }

    function withdrawCapital(uint256 amount) external onlyOwner {
        require(amount <= vaultCapital, "PARRY: insufficient capital");
        vaultCapital -= amount;
        (bool sent, ) = payable(owner()).call{value: amount}("");
        require(sent, "PARRY: withdraw failed");
        emit CapitalWithdrawn(owner(), amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function setAgentWallet(address _agentWallet) external onlyOwner {
        require(_agentWallet != address(0), "PARRY: zero address");
        agentWallet = _agentWallet;
    }

    function setCertContract(address _certContract) external onlyOwner {
        certContract = _certContract;
    }

    function setBasePremiumBps(uint256 _bps) external onlyOwner {
        require(_bps <= 100, "PARRY: bps too high");
        basePremiumBps = _bps;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View
    // ─────────────────────────────────────────────────────────────────────────

    function getPolicy(bytes32 policyId) external view returns (ProtectionPolicy memory) {
        return policies[policyId];
    }

    function getLpPolicies(address lp) external view returns (bytes32[] memory) {
        return lpPolicies[lp];
    }

    function getVaultStats() external view returns (
        uint256 capital,
        uint256 premiumsCollected,
        uint256 claimsPaid
    ) {
        return (vaultCapital, totalPremiumsCollected, totalClaimsPaid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256("PARRY"),
            keccak256("1"),
            block.chainid,
            address(this)
        ));
    }

    function _recoverSigner(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "PARRY: invalid sig length");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        return ecrecover(hash, v, r, s);
    }

    receive() external payable {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Interface for ProtectionCert NFT
// ─────────────────────────────────────────────────────────────────────────────

interface IProtectionCert {
    function mint(
        address to,
        bytes32 policyId,
        address pool,
        int24 tickLower,
        int24 tickUpper,
        uint256 expiresAt
    ) external returns (uint256 tokenId);

    function burnAndSettle(uint256 tokenId) external;
    function expire(uint256 tokenId) external;
}
