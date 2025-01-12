import {
  Address,
  Chain,
  encodeAbiParameters,
  parseAbiParameters,
  zeroAddress,
  Account,
  SimulateContractParameters,
} from "viem";
import {
  erc20MinterABI,
  erc20MinterAddress,
  zoraCreator1155ImplABI,
  zoraCreatorFixedPriceSaleStrategyAddress,
} from "@zoralabs/protocol-deployments";
import { IHttpClient } from "src/apis/http-api-base";
import { zora721Abi } from "src/constants";
import { GenericTokenIdTypes } from "src/types";
import {
  MintAPIClient,
  SalesConfigAndTokenInfo,
  SaleType,
} from "./mint-api-client";
import {
  makeSimulateContractParamaters,
  ClientConfig,
  setupClient,
  PublicClient,
} from "src/utils";

class MintError extends Error {}
class MintInactiveError extends Error {}

export const Errors = {
  MintError,
  MintInactiveError,
};

type MintArguments = {
  /** Quantity of tokens to mint */
  quantityToMint: number;
  /** Comment to add to the mint */
  mintComment?: string;
  /** Optional address to receive the mint referral reward */
  mintReferral?: Address;
  /** Address to receive the minted tokens */
  mintToAddress: Address;
  saleType?: SaleType;
};

type MintTokenParams = {
  /** Account to execute the mint */
  minterAccount: Address | Account;
  /** Contract address of token to mint */
  tokenAddress: Address;
  /** Id of token to mint */
  tokenId?: GenericTokenIdTypes;
  /** Mint settings */
  mintArguments: MintArguments;
};

class MintClient {
  readonly apiClient: MintAPIClient;
  readonly publicClient: PublicClient;

  constructor(
    chain: Chain,
    publicClient: PublicClient,
    httpClient: IHttpClient,
  ) {
    this.apiClient = new MintAPIClient(chain.id, httpClient);
    this.publicClient = publicClient;
  }

  /**
   * Returns the parameters needed to prepare a transaction mint a token.
   *
   * @param parameters - Parameters for collecting the token {@link MintTokenParams}
   * @returns Parameters for simulating/executing the mint transaction
   */
  async makePrepareMintTokenParams(parameters: MintTokenParams) {
    return makePrepareMintTokenParams({
      ...parameters,
      apiClient: this.apiClient,
      publicClient: this.publicClient,
    });
  }
}

/**
 * Creates a new MintClient.
 * @param param0.chain The chain to use for the mint client.
 * @param param0.publicClient Optional viem public client
 * @param param0.httpClient Optional http client to override post, get, and retry methods
 * @returns
 */
export function createMintClient(clientConfig: ClientConfig) {
  const { chain, publicClient, httpClient } = setupClient(clientConfig);
  return new MintClient(chain, publicClient, httpClient);
}

export type TMintClient = ReturnType<typeof createMintClient>;

async function makePrepareMintTokenParams({
  publicClient,
  apiClient,
  tokenId,
  tokenAddress,
  mintArguments,
  ...rest
}: {
  publicClient: PublicClient;
  minterAccount: Address | Account;
  tokenId?: GenericTokenIdTypes;
  tokenAddress: Address;
  mintArguments: MintArguments;
  apiClient: MintAPIClient;
}): Promise<
  SimulateContractParameters<any, any, any, any, any, Account | Address>
> {
  const salesConfigAndTokenInfo = await apiClient.getSalesConfigAndTokenInfo({
    tokenId,
    tokenAddress,
    saleType: mintArguments.saleType,
  });

  if (tokenId === undefined) {
    return makePrepareMint721TokenParams({
      salesConfigAndTokenInfo,
      tokenAddress,
      mintArguments,
      ...rest,
    });
  }

  return makePrepareMint1155TokenParams({
    salesConfigAndTokenInfo,
    tokenAddress,
    tokenId,
    mintArguments,
    ...rest,
  });
}

async function makePrepareMint721TokenParams({
  tokenAddress,
  salesConfigAndTokenInfo,
  minterAccount,
  mintArguments,
}: {
  tokenAddress: Address;
  salesConfigAndTokenInfo: SalesConfigAndTokenInfo;
  minterAccount: Address | Account;
  mintArguments: MintArguments;
}) {
  const mintValue = getMintCosts({
    salesConfigAndTokenInfo,
    quantityToMint: BigInt(mintArguments.quantityToMint),
  }).totalCost;

  return makeSimulateContractParamaters({
    abi: zora721Abi,
    address: tokenAddress,
    account: minterAccount,
    functionName: "mintWithRewards",
    value: mintValue,
    args: [
      mintArguments.mintToAddress,
      BigInt(mintArguments.quantityToMint),
      mintArguments.mintComment || "",
      mintArguments.mintReferral || zeroAddress,
    ],
  });
}

export type MintCosts = {
  mintFee: bigint;
  tokenPurchaseCost: bigint;
  totalCost: bigint;
};

export function getMintCosts({
  salesConfigAndTokenInfo,
  quantityToMint,
}: {
  salesConfigAndTokenInfo: SalesConfigAndTokenInfo;
  quantityToMint: bigint;
}): MintCosts {
  const mintFeeForTokens =
    salesConfigAndTokenInfo.mintFeePerQuantity * quantityToMint;
  const tokenPurchaseCost =
    BigInt(salesConfigAndTokenInfo.salesConfig.pricePerToken) * quantityToMint;

  return {
    mintFee: mintFeeForTokens,
    tokenPurchaseCost,
    totalCost: mintFeeForTokens + tokenPurchaseCost,
  };
}

async function makePrepareMint1155TokenParams({
  tokenId,
  salesConfigAndTokenInfo,
  minterAccount,
  tokenAddress,
  mintArguments,
}: {
  salesConfigAndTokenInfo: SalesConfigAndTokenInfo;
  tokenId: GenericTokenIdTypes;
  minterAccount: Address | Account;
  tokenAddress: Address;
  mintArguments: MintArguments;
}) {
  const mintQuantity = BigInt(mintArguments.quantityToMint);

  const mintValue = getMintCosts({
    salesConfigAndTokenInfo,
    quantityToMint: mintQuantity,
  }).totalCost;

  switch (salesConfigAndTokenInfo.salesConfig.saleType) {
    case "fixedPrice":
      const fixedPriceArgs = mintArguments;

      return makeSimulateContractParamaters({
        abi: zoraCreator1155ImplABI,
        functionName: "mintWithRewards",
        account: minterAccount,
        value: mintValue,
        address: tokenAddress,
        /* args: minter, tokenId, quantity, minterArguments, mintReferral */
        args: [
          (salesConfigAndTokenInfo.salesConfig.address ||
            zoraCreatorFixedPriceSaleStrategyAddress[999999999]) as Address,
          BigInt(tokenId),
          mintQuantity,
          encodeAbiParameters(parseAbiParameters("address, string"), [
            fixedPriceArgs.mintToAddress,
            fixedPriceArgs.mintComment || "",
          ]),
          fixedPriceArgs.mintReferral || zeroAddress,
        ],
      });

    case "erc20":
      const erc20Args = mintArguments;

      return makeSimulateContractParamaters({
        abi: erc20MinterABI,
        functionName: "mint",
        account: minterAccount,
        address: (salesConfigAndTokenInfo?.salesConfig.address ||
          erc20MinterAddress[999999999]) as Address,
        /* args: mintTo, quantity, tokenAddress, tokenId, totalValue, currency, mintReferral, comment */
        args: [
          mintArguments.mintToAddress,
          mintQuantity,
          tokenAddress,
          BigInt(tokenId),
          salesConfigAndTokenInfo.salesConfig.pricePerToken,
          salesConfigAndTokenInfo.salesConfig.currency,
          erc20Args.mintReferral || zeroAddress,
          erc20Args.mintComment || "",
        ],
      });

    default:
      throw new MintError("Unsupported sale type");
  }
}
