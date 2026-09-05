export const BPS = 10_000n;

export function ceilDiv(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) throw new Error("Denominator must be positive.");
  return numerator === 0n ? 0n : (numerator - 1n) / denominator + 1n;
}

export function constantProductOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint) {
  if (amountIn < 0n || reserveIn < 0n || reserveOut < 0n) throw new Error("Amounts cannot be negative.");
  if (amountIn === 0n || reserveOut === 0n) return 0n;
  return amountIn * reserveOut / (reserveIn + amountIn);
}

export function constantProductIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint) {
  if (amountOut < 0n || reserveIn < 0n || reserveOut < 0n) throw new Error("Amounts cannot be negative.");
  if (amountOut === 0n) return 0n;
  if (amountOut >= reserveOut) throw new Error("Output must be smaller than the reserve.");
  return amountOut * reserveIn / (reserveOut - amountOut) + 1n;
}

export function deductBps(amount: bigint, ...rates: bigint[]) {
  const deductions = rates.reduce((sum, rate) => sum + amount * rate / BPS, 0n);
  return amount > deductions ? amount - deductions : 0n;
}

export function quoteCurveBuy(input: {
  quoteIn: bigint;
  quoteReserve: bigint;
  tokenReserve: bigint;
  sellableTokens: bigint;
  feeBps: bigint;
  creatorTaxBps: bigint;
  snipeTaxBps: bigint;
}) {
  return quoteCurveBuyDetailed(input).tokensOut;
}

export function quoteCurveBuyDetailed(input: {
  quoteIn: bigint;
  quoteReserve: bigint;
  tokenReserve: bigint;
  sellableTokens: bigint;
  feeBps: bigint;
  creatorTaxBps: bigint;
  snipeTaxBps: bigint;
}) {
  const fixedTaxes = input.feeBps + input.creatorTaxBps;
  if (fixedTaxes >= BPS) throw new Error("Curve fees are invalid.");
  const maximumSnipeTax = BPS - fixedTaxes - 100n;
  const snipeTaxBps = input.snipeTaxBps > maximumSnipeTax ? maximumSnipeTax : input.snipeTaxBps;
  const netQuote = deductBps(input.quoteIn, input.feeBps, input.creatorTaxBps, snipeTaxBps);
  const calculated = constantProductOut(netQuote, input.quoteReserve, input.tokenReserve);
  if (calculated <= input.sellableTokens) return { tokensOut: calculated, rateTokensOut: calculated, quoteSpent: input.quoteIn, quoteRefund: 0n, snipeTaxBps };
  const requiredNetQuote = constantProductIn(input.sellableTokens, input.quoteReserve, input.tokenReserve);
  const grossQuote = ceilDiv(requiredNetQuote * BPS, BPS - input.feeBps - input.creatorTaxBps - snipeTaxBps);
  const quoteSpent = grossQuote > input.quoteIn ? input.quoteIn : grossQuote;
  return { tokensOut: input.sellableTokens, rateTokensOut: calculated, quoteSpent, quoteRefund: input.quoteIn - quoteSpent, snipeTaxBps };
}

export function quoteCurveSell(input: {
  tokensIn: bigint;
  quoteReserve: bigint;
  tokenReserve: bigint;
  feeBps: bigint;
  creatorTaxBps: bigint;
}) {
  const grossQuote = constantProductOut(input.tokensIn, input.tokenReserve, input.quoteReserve);
  return deductBps(grossQuote, input.feeBps, input.creatorTaxBps);
}

export function minAfterSlippage(amount: bigint, slippageBps: bigint) {
  if (slippageBps < 0n || slippageBps >= BPS) throw new Error("Slippage must be between 0 and 9999 bps.");
  return amount * (BPS - slippageBps) / BPS;
}

export function progressBps(realQuoteReserve: bigint, graduationThreshold: bigint) {
  if (graduationThreshold <= 0n) return 0;
  const value = realQuoteReserve * BPS / graduationThreshold;
  return Number(value > BPS ? BPS : value);
}

export function spotPriceRaw(quoteReserve: bigint, tokenReserve: bigint, precision = 18) {
  if (tokenReserve === 0n) return null;
  return quoteReserve * 10n ** BigInt(precision) / tokenReserve;
}

export function normalizedPriceRaw(quoteReserve: bigint, tokenReserve: bigint, quoteDecimals: number, tokenDecimals: number) {
  if (tokenReserve === 0n) return null;
  return quoteReserve * 10n ** BigInt(tokenDecimals) * 10n ** 18n / (tokenReserve * 10n ** BigInt(quoteDecimals));
}
