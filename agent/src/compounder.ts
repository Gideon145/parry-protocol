import { OnchainOSClient } from "./onchainos";
import { logger } from "./logger";

/**
 * PARRY Fee Compounder
 *
 * Automatically collects V3 trading fees and reinvests them back into
 * the LP position, creating the "earn-pay-earn" cycle the hackathon requires.
 *
 * Flow:
 *  1. Collect V3 fees via onchainos defi collect --reward-type V3_FEE
 *  2. Get current pool price to determine optimal token ratio
 *  3. Rebalance collected fees to correct ratio via onchainos swap execute
 *  4. Reinvest into same tick range via onchainos defi invest
 *  5. Emit FeeCompounded event to frontend websocket
 */
export class FeeCompounder {
  private client: OnchainOSClient;
  private agentWallet: string;
  private lastCompoundBlock: Map<string, number> = new Map();
  private readonly COMPOUND_INTERVAL_BLOCKS: number;

  constructor(client: OnchainOSClient, agentWallet: string) {
    this.client = client;
    this.agentWallet = agentWallet;
    const configuredInterval = parseInt(process.env.COMPOUND_INTERVAL_BLOCKS || "100", 10);
    this.COMPOUND_INTERVAL_BLOCKS = Number.isFinite(configuredInterval) && configuredInterval > 0
      ? configuredInterval
      : 100;
  }

  /**
   * Check and compound fees for a position if interval has passed.
   */
  async maybeCompound(
    investmentId: string,
    tokenId: string,
    tickLower: number,
    tickUpper: number,
    currentBlock: number,
    force = false,
    chain = "xlayer"
  ): Promise<{ compounded: boolean; feesCollected?: string; reinvestedAmount?: string }> {
    const lastBlock = this.lastCompoundBlock.get(investmentId) || 0;

    if (!force && currentBlock - lastBlock < this.COMPOUND_INTERVAL_BLOCKS) {
      return { compounded: false };
    }

    logger.info(`[FeeCompounder] Collecting fees for position ${tokenId}...`);

    // Step 1: Collect fees
    const collectResult = await this.client.collectFees(
      investmentId,
      this.agentWallet,
      tokenId,
      chain
    );

    if (!collectResult.success) {
      logger.warn(`[FeeCompounder] Fee collection failed: ${collectResult.error}`);
      return { compounded: false };
    }

    const collectData = collectResult.data as Record<string, unknown>;
    const feesToken0 = String(collectData?.amount0 || collectData?.token0Amount || "0");
    const feesToken1 = String(collectData?.amount1 || collectData?.token1Amount || "0");

    logger.info(`[FeeCompounder] Collected fees: token0=${feesToken0} token1=${feesToken1}`);

    if (parseFloat(feesToken0) === 0 && parseFloat(feesToken1) === 0) {
      this.lastCompoundBlock.set(investmentId, currentBlock);
      return { compounded: false };
    }

    // Step 2: Re-deposit via defi invest at same tick range
    const tokens = [feesToken0, feesToken1].filter(a => parseFloat(a) > 0);
    let reinvested = false;

    for (const tokenAmount of tokens) {
      if (parseFloat(tokenAmount) > 0.001) {
        const investResult = await this.client.openLPPosition(
          investmentId,
          this.agentWallet,
          "native",    // will be resolved by onchainos defi invest
          tokenAmount,
          tickLower,
          tickUpper,
          chain
        );

        if (investResult.success) {
          reinvested = true;
          logger.info(`[FeeCompounder] Reinvested ${tokenAmount} into LP at ticks [${tickLower}, ${tickUpper}]`);
        }
      }
    }

    this.lastCompoundBlock.set(investmentId, currentBlock);

    return {
      compounded: reinvested,
      feesCollected: `${feesToken0} / ${feesToken1}`,
      reinvestedAmount: tokens.join(" + "),
    };
  }
}
