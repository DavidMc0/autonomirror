// Loaded on demand when someone pays, so ethers stays out of the main bundle.
import { BrowserProvider, Contract, type Eip1193Provider } from "ethers";
import type { PaymentNetwork, PaymentProvider } from "@withautonomi/ant-browser-sdk";
import { createEthersPaymentProvider } from "@withautonomi/ant-browser-sdk/ethers";

export const ARBITRUM_ONE = 42161;

/** A problem to show next to the Pay button; the price stays on screen so the user can retry. */
export class WalletProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletProblem";
  }
}

export interface WalletState {
  account: string;
  /** Payment token (ANT) balance in atto. */
  ant: bigint;
  /** ETH balance in wei, for gas. */
  eth: bigint;
}

export function injectedWallet(): Eip1193Provider | undefined {
  return (window as Window & { ethereum?: Eip1193Provider }).ethereum;
}

/** Ask for an account, move the wallet to the payment chain and read both balances. */
export async function connectWallet(network: PaymentNetwork): Promise<WalletState> {
  const wallet = injectedWallet();
  if (!wallet) throw new WalletProblem("No browser wallet found. Install a wallet extension such as MetaMask, then reload this page.");
  try {
    await wallet.request({ method: "eth_requestAccounts" });
    await switchChain(wallet, network.chainId);
    // A fresh provider after the switch, so it doesn't report the old chain.
    const provider = new BrowserProvider(wallet);
    const signer = await provider.getSigner();
    const account = await signer.getAddress();
    const token = new Contract(network.paymentTokenAddress, ["function balanceOf(address) view returns (uint256)"], provider);
    const [ant, eth] = await Promise.all([token.balanceOf(account) as Promise<bigint>, provider.getBalance(account)]);
    return { account, ant, eth };
  } catch (err) {
    if (err instanceof WalletProblem) throw err;
    if (isUserRejection(err)) throw new WalletProblem("The wallet request was declined. Click Pay to try again.");
    throw new WalletProblem(`Couldn't connect to your wallet: ${shortMessage(err)}`);
  }
}

async function switchChain(wallet: Eip1193Provider, chainId: number): Promise<void> {
  const hexId = `0x${chainId.toString(16)}`;
  if ((await wallet.request({ method: "eth_chainId" })) === hexId) return;
  try {
    await wallet.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
  } catch (err) {
    // 4902: the wallet doesn't know the chain yet. Only Arbitrum One is added automatically.
    if (errorCode(err) !== 4902 || chainId !== ARBITRUM_ONE) throw err;
    await wallet.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexId,
          chainName: "Arbitrum One",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://arb1.arbitrum.io/rpc"],
          blockExplorerUrls: ["https://arbiscan.io"],
        },
      ],
    });
  }
}

/**
 * The SDK's Ethers adapter, approving exactly each upload's cost. The signer is
 * resolved when payment starts, after connectWallet has put the wallet on the right chain.
 */
export function walletPayment(): PaymentProvider {
  return createEthersPaymentProvider({
    approval: "exact",
    getSigner: async (network) => {
      const wallet = injectedWallet();
      if (!wallet) throw new Error("The browser wallet is no longer available");
      const provider = new BrowserProvider(wallet);
      if ((await provider.getNetwork()).chainId !== BigInt(network.chainId)) {
        throw new Error("The wallet changed networks. Switch it back to Arbitrum One and try again.");
      }
      return provider.getSigner();
    },
  });
}

/** True when the user declined a wallet prompt (EIP-1193 4001, or ethers' ACTION_REJECTED), however deeply wrapped. */
export function isUserRejection(err: unknown): boolean {
  for (let e = err, depth = 0; e && typeof e === "object" && depth < 8; depth++) {
    const code = errorCode(e);
    if (code === 4001 || code === "ACTION_REJECTED") return true;
    e = (e as { cause?: unknown; error?: unknown }).cause ?? (e as { error?: unknown }).error;
  }
  return false;
}

function errorCode(err: unknown): unknown {
  return typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
}

function shortMessage(err: unknown): string {
  const e = err as { shortMessage?: unknown; message?: unknown };
  return typeof e?.shortMessage === "string" ? e.shortMessage : typeof e?.message === "string" ? e.message : String(err);
}
