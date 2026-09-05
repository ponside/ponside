import { isAddress, zeroAddress } from "viem";
import { z } from "zod";

export const addressSchema = z.string().refine(isAddress, "Invalid wallet or token address.").transform((value) => value.toLowerCase() as `0x${string}`);

export const quoteSchema = z.object({
  tokenAddress: addressSchema,
  side: z.enum(["buy", "sell"]),
  amount: z.string().max(100).regex(/^\d+(\.\d+)?$/, "Enter a valid amount."),
  slippageBps: z.number().int().min(1).max(2_000).default(100),
});

export const launchSchema = z.object({
  name: z.string().trim().min(1).max(80),
  symbol: z.string().trim().regex(/^[A-Za-z0-9]{1,12}$/).transform((value) => value.toUpperCase()),
  logo: z.string().url().max(500).or(z.literal("")),
  description: z.string().trim().max(500),
  twitter: z.string().trim().max(200).default(""),
  telegram: z.string().trim().max(200).default(""),
  discord: z.string().trim().max(200).default(""),
  website: z.string().trim().max(300).default(""),
  farcaster: z.string().trim().max(200).default(""),
  launchConfigId: z.string().regex(/^\d+$/),
  pairToken: addressSchema.default(zeroAddress),
  creatorTaxBps: z.number().int().min(0).max(10_000),
  buybackEnabled: z.boolean(),
  devBuy: z.string().max(100).regex(/^\d+(\.\d+)?$/).default("0"),
  slippageBps: z.number().int().min(1).max(2_000).default(100),
});

export const transactionHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash.");

export const sendSchema = z.object({
  asset: z.union([z.literal("native"), addressSchema]),
  recipient: addressSchema.refine((value) => value !== zeroAddress, "The zero address cannot receive wallet transfers."),
  amount: z.string().max(100).regex(/^\d+(\.\d+)?$/, "Enter a valid amount."),
});
