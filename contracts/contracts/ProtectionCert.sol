// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title ProtectionCert
 * @notice Parry Protocol — On-chain Protection Certificate NFT
 * @dev Each NFT represents an active IL protection policy. The metadata is
 *      fully on-chain and dynamically reflects the current protection status:
 *        • ACTIVE   — receiving coverage and hedge execution
 *        • AT_RISK  — IL approaching threshold, kill switch armed
 *        • SETTLED  — claim was paid out
 *        • EXPIRED  — coverage period ended without claim
 *
 *      These NFTs are transferable — the holder can sell their protection
 *      mid-flight to another LP on the open market, making PARRY coverage
 *      a composable DeFi primitive.
 */
contract ProtectionCert is ERC721, Ownable {
    using Strings for uint256;
    using Strings for int24;

    // ─────────────────────────────────────────────────────────────────────────
    // Enums & Structs
    // ─────────────────────────────────────────────────────────────────────────

    enum CertStatus { ACTIVE, AT_RISK, SETTLED, EXPIRED }

    struct CertData {
        bytes32 policyId;
        address pool;
        int24   tickLower;
        int24   tickUpper;
        uint256 activatedAt;
        uint256 expiresAt;
        CertStatus status;
        uint256 ilBpsAtSettle;  // 0 if not settled
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    uint256 private _nextTokenId = 1;

    /// @notice Address of ParryVault (only minter/burner)
    address public vault;

    mapping(uint256 => CertData) public certData;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event CertMinted(uint256 indexed tokenId, bytes32 policyId, address indexed lp);
    event CertStatusUpdated(uint256 indexed tokenId, CertStatus status);

    // ─────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────────

    modifier onlyVault() {
        require(msg.sender == vault, "ProtectionCert: not vault");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor() ERC721("PARRY Protection Certificate", "PARRY-CERT") Ownable(msg.sender) {}

    // ─────────────────────────────────────────────────────────────────────────
    // Vault-gated Lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    function mint(
        address to,
        bytes32 policyId,
        address pool,
        int24 tickLower,
        int24 tickUpper,
        uint256 expiresAt
    ) external onlyVault returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        certData[tokenId] = CertData({
            policyId: policyId,
            pool: pool,
            tickLower: tickLower,
            tickUpper: tickUpper,
            activatedAt: block.timestamp,
            expiresAt: expiresAt,
            status: CertStatus.ACTIVE,
            ilBpsAtSettle: 0
        });

        emit CertMinted(tokenId, policyId, to);
    }

    function markAtRisk(uint256 tokenId) external onlyVault {
        certData[tokenId].status = CertStatus.AT_RISK;
        emit CertStatusUpdated(tokenId, CertStatus.AT_RISK);
    }

    function burnAndSettle(uint256 tokenId) external onlyVault {
        certData[tokenId].status = CertStatus.SETTLED;
        emit CertStatusUpdated(tokenId, CertStatus.SETTLED);
        _burn(tokenId);
    }

    function expire(uint256 tokenId) external onlyVault {
        certData[tokenId].status = CertStatus.EXPIRED;
        emit CertStatusUpdated(tokenId, CertStatus.EXPIRED);
        _burn(tokenId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Dynamic On-chain SVG Metadata
    // ─────────────────────────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        CertData memory d = certData[tokenId];

        string memory statusStr;
        string memory statusColor;
        string memory glowColor;

        if (d.status == CertStatus.ACTIVE) {
            statusStr = "ACTIVE";
            statusColor = "#00d4ff";
            glowColor = "rgb(0,212,255)";
        } else if (d.status == CertStatus.AT_RISK) {
            statusStr = "AT RISK";
            statusColor = "#ff9500";
            glowColor = "rgb(255,149,0)";
        } else if (d.status == CertStatus.SETTLED) {
            statusStr = "SETTLED";
            statusColor = "#00ff88";
            glowColor = "rgb(0,255,136)";
        } else {
            statusStr = "EXPIRED";
            statusColor = "#666688";
            glowColor = "rgb(102,102,136)";
        }

        string memory svg = _buildSVG(d, statusStr, statusColor, glowColor, tokenId);

        string memory json = Base64.encode(bytes(string(abi.encodePacked(
            '{"name":"PARRY Protection Cert #', tokenId.toString(),
            '","description":"Parry Protocol - Delta-Neutral LP Impermanent Loss Protection. This certificate grants the holder coverage against IL events on X Layer Uniswap positions.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '","attributes":[',
            '{"trait_type":"Status","value":"', statusStr, '"},',
            '{"trait_type":"Pool","value":"', _toHexString(uint160(d.pool), 20), '"},',
            '{"trait_type":"Tick Lower","value":', _int24ToString(d.tickLower), '},',
            '{"trait_type":"Tick Upper","value":', _int24ToString(d.tickUpper), '},',
            '{"trait_type":"Expires At Block","value":', d.expiresAt.toString(),
            '}]}'
        ))));

        return string(abi.encodePacked("data:application/json;base64,", json));
    }

    function _buildSVG(
        CertData memory d,
        string memory statusStr,
        string memory statusColor,
        string memory glowColor,
        uint256 tokenId
    ) internal pure returns (string memory) {
        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">',
            '<defs>',
            '<radialGradient id="bg" cx="50%" cy="50%" r="50%">',
            '<stop offset="0%" stop-color="#0a0a2e"/>',
            '<stop offset="100%" stop-color="#050510"/>',
            '</radialGradient>',
            '<filter id="glow"><feGaussianBlur stdDeviation="4" result="coloredBlur"/>',
            '<feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            '</defs>',
            '<rect width="500" height="500" fill="url(#bg)"/>',
            // Grid lines
            '<line x1="0" y1="100" x2="500" y2="100" stroke="#0f0f3a" stroke-width="1"/>',
            '<line x1="0" y1="200" x2="500" y2="200" stroke="#0f0f3a" stroke-width="1"/>',
            '<line x1="0" y1="300" x2="500" y2="300" stroke="#0f0f3a" stroke-width="1"/>',
            '<line x1="0" y1="400" x2="500" y2="400" stroke="#0f0f3a" stroke-width="1"/>',
            '<line x1="100" y1="0" x2="100" y2="500" stroke="#0f0f3a" stroke-width="1"/>',
            '<line x1="200" y1="0" x2="200" y2="500" stroke="#0f0f3a" stroke-width="1"/>',
            '<line x1="300" y1="0" x2="300" y2="500" stroke="#0f0f3a" stroke-width="1"/>',
            '<line x1="400" y1="0" x2="400" y2="500" stroke="#0f0f3a" stroke-width="1"/>',
            // Hexagonal PARRY
            '<polygon points="250,60 310,95 310,165 250,200 190,165 190,95" fill="none" stroke="',
            statusColor, '" stroke-width="2" filter="url(#glow)"/>',
            '<polygon points="250,75 297,101 297,153 250,179 203,153 203,101" fill="',
            statusColor, '" fill-opacity="0.08"/>',
            // S letter in PARRY
            '<text x="250" y="143" font-family="monospace" font-size="36" font-weight="bold" fill="',
            statusColor, '" text-anchor="middle" filter="url(#glow)">S</text>',
            // Title
            '<text x="250" y="235" font-family="monospace" font-size="18" fill="#c8d6e5" text-anchor="middle" letter-spacing="4">PARRY</text>',
            '<text x="250" y="255" font-family="monospace" font-size="9" fill="#7c7caa" text-anchor="middle" letter-spacing="2">DELTA-NEUTRAL LP PROTECTION</text>',
            // Status badge
            '<rect x="175" y="272" width="150" height="24" rx="4" fill="', statusColor, '" fill-opacity="0.15" stroke="', statusColor, '" stroke-width="1"/>',
            '<text x="250" y="288" font-family="monospace" font-size="11" fill="', statusColor, '" text-anchor="middle" letter-spacing="3">', statusStr, '</text>',
            // Cert ID
            '<text x="250" y="330" font-family="monospace" font-size="10" fill="#7c7caa" text-anchor="middle">CERT #', tokenId.toString(), '</text>',
            // Tick range
            '<text x="250" y="360" font-family="monospace" font-size="9" fill="#5a5a8a" text-anchor="middle">',
            'TICK [', _int24ToString(d.tickLower), ' / ', _int24ToString(d.tickUpper), ']</text>',
            // Expires
            '<text x="250" y="385" font-family="monospace" font-size="9" fill="#5a5a8a" text-anchor="middle">',
            'EXPIRES BLOCK ', d.expiresAt.toString(), '</text>',
            // Bottom border
            '<line x1="50" y1="430" x2="450" y2="430" stroke="#1a1a4a" stroke-width="1"/>',
            '<text x="250" y="455" font-family="monospace" font-size="8" fill="#3a3a6a" text-anchor="middle">X LAYER MAINNET - ONCHAIN OS PROTECTED</text>',
            // Corner accents
            '<line x1="20" y1="20" x2="50" y2="20" stroke="', statusColor, '" stroke-width="1.5" opacity="0.5"/>',
            '<line x1="20" y1="20" x2="20" y2="50" stroke="', statusColor, '" stroke-width="1.5" opacity="0.5"/>',
            '<line x1="480" y1="20" x2="450" y2="20" stroke="', statusColor, '" stroke-width="1.5" opacity="0.5"/>',
            '<line x1="480" y1="20" x2="480" y2="50" stroke="', statusColor, '" stroke-width="1.5" opacity="0.5"/>',
            '<line x1="20" y1="480" x2="50" y2="480" stroke="', statusColor, '" stroke-width="1.5" opacity="0.5"/>',
            '<line x1="20" y1="480" x2="20" y2="450" stroke="', statusColor, '" stroke-width="1.5" opacity="0.5"/>',
            '<line x1="480" y1="480" x2="450" y2="480" stroke="', statusColor, '" stroke-width="1.5" opacity="0.5"/>',
            '<line x1="480" y1="480" x2="480" y2="450" stroke="', statusColor, '" stroke-width="1.5" opacity="0.5"/>',
            '</svg>'
        ));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // String Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _int24ToString(int24 val) internal pure returns (string memory) {
        if (val < 0) {
            return string(abi.encodePacked("-", uint256(uint24(-val)).toString()));
        }
        return uint256(uint24(val)).toString();
    }

    function _toHexString(uint256 value, uint256 length) internal pure returns (string memory) {
        bytes memory buffer = new bytes(2 * length + 2);
        buffer[0] = '0';
        buffer[1] = 'x';
        bytes16 hexChars = "0123456789abcdef";
        for (uint256 i = 2 * length + 1; i > 1; --i) {
            buffer[i] = hexChars[value & 0xf];
            value >>= 4;
        }
        return string(buffer);
    }
}
