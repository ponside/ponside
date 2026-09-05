import "server-only";
import { PrivyClient, type LinkedAccount, type User } from "@privy-io/node";
import { getAddress, isAddress } from "viem";
import { getPrivyEnv } from "@/lib/server/env";
import { HttpError } from "@/lib/server/http";
import { getServiceSupabase, throwDatabaseError } from "@/lib/server/supabase";
import { canModifyResource } from "@/lib/permissions";
import { highQualityAvatarUrl } from "@/lib/avatar";

let client: PrivyClient | undefined;

function getPrivyClient() {
  if (!client) client = new PrivyClient(getPrivyEnv());
  return client;
}

function isTwitter(account: LinkedAccount): account is Extract<LinkedAccount, { type: "twitter_oauth" }> {
  return account.type === "twitter_oauth";
}

function isPrimaryEmbeddedEthereumWallet(account: LinkedAccount): account is Extract<LinkedAccount, { type: "wallet" }> {
  return account.type === "wallet"
    && "chain_type" in account
    && account.chain_type === "ethereum"
    && "connector_type" in account
    && account.connector_type === "embedded"
    && "wallet_index" in account
    && account.wallet_index === 0;
}

export type AuthenticatedProfile = {
  id: string;
  privyUserId: string;
  handle: string;
  walletAddress: `0x${string}` | null;
};

async function provisionProfile(user: User): Promise<AuthenticatedProfile> {
  const twitter = user.linked_accounts.find(isTwitter);
  const xUserId = twitter?.subject?.trim();
  const xHandle = twitter?.username?.trim().replace(/^@/, "");
  if (!twitter || !xUserId || !xHandle || !/^[A-Za-z0-9_]{1,15}$/.test(xHandle)) throw new HttpError(403, "X_ACCOUNT_REQUIRED", "Sign in with a valid X account to use Ponside.");
  const wallet = user.linked_accounts.find(isPrimaryEmbeddedEthereumWallet);
  if (!wallet || !("address" in wallet) || !isAddress(wallet.address)) throw new HttpError(409, "WALLET_NOT_READY", "Your embedded wallet is still being created. Please try again shortly.");
  const row = {
    privy_user_id: user.id,
    x_user_id: xUserId,
    x_handle: xHandle,
    display_name: twitter.name?.trim() || xHandle,
    avatar_url: highQualityAvatarUrl(twitter.profile_picture_url),
    wallet_address: getAddress(wallet.address).toLowerCase(),
  };
  const supabase = getServiceSupabase();
  const selection = "id, privy_user_id, x_user_id, x_handle, wallet_address";
  const { data: byPrivy, error: byPrivyError } = await supabase.from("profiles").select(selection).eq("privy_user_id", user.id).maybeSingle();
  if (byPrivyError) throwDatabaseError(byPrivyError, "Profile identity lookup");
  if (byPrivy) {
    if (byPrivy.x_user_id !== row.x_user_id) throw new HttpError(409, "X_IDENTITY_MISMATCH", "This Ponside profile is permanently linked to a different X identity.");
    if (byPrivy.wallet_address.toLowerCase() !== row.wallet_address) throw new HttpError(409, "WALLET_IDENTITY_MISMATCH", "The authenticated embedded wallet does not match this Ponside profile.");
    const { data, error } = await supabase.from("profiles").update({ x_handle: row.x_handle, display_name: row.display_name, avatar_url: row.avatar_url }).eq("id", byPrivy.id).select(selection).single();
    if (error) throwDatabaseError(error, "Profile refresh");
    return { id: String(data.id), privyUserId: String(data.privy_user_id), handle: String(data.x_handle), walletAddress: data.wallet_address as `0x${string}` };
  }
  const { data: byX, error: byXError } = await supabase.from("profiles").select(selection).eq("x_user_id", row.x_user_id).maybeSingle();
  if (byXError) throwDatabaseError(byXError, "X identity lookup");
  if (byX) throw new HttpError(409, "X_ACCOUNT_ALREADY_LINKED", "This X account is already linked to another Privy identity.");
  const { data, error } = await supabase.from("profiles").insert(row).select(selection).single();
  if (error) throwDatabaseError(error, "Profile provisioning");
  return { id: String(data.id), privyUserId: String(data.privy_user_id), handle: String(data.x_handle), walletAddress: data.wallet_address as `0x${string}` | null };
}

export async function requireAuth(request: Request) {
  const header = request.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "AUTH_REQUIRED", "Sign in to continue.");
  const privy = getPrivyClient();
  let user: User;
  try {
    const claims = await privy.utils().auth().verifyAuthToken(token);
    user = await privy.users()._get(claims.user_id);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, "INVALID_AUTH_TOKEN", "Your session is invalid or expired.");
  }
  return provisionProfile(user);
}

export async function optionalAuth(request: Request) {
  if (!request.headers.get("authorization")) return null;
  return requireAuth(request);
}

export function assertOwner(ownerId: string, profileId: string) {
  if (!canModifyResource(ownerId, profileId)) throw new HttpError(403, "NOT_OWNER", "You cannot modify this resource.");
}
