import { describe, expect } from "vitest";
import {
  getContractAddressFromReceipt,
  getTokenIdFromCreateReceipt,
} from "./1155-create-helper";
import { createCreatorClient } from "src/sdk";
import { zoraCreator1155ImplABI } from "@zoralabs/protocol-deployments";
import { waitForSuccess } from "src/test-utils";
import { parseEther } from "viem";
import {
  MintableParameters,
  makePrepareMint1155TokenParams,
} from "src/mint/mint-transactions";
import { forkUrls, makeAnvilTest } from "src/anvil";
import { zora } from "viem/chains";

const demoTokenMetadataURI = "ipfs://DUMMY/token.json";
const demoContractMetadataURI = "ipfs://DUMMY/contract.json";

const anvilTest = makeAnvilTest({
  forkUrl: forkUrls.zoraMainnet,
  forkBlockNumber: 18094820,
  anvilChainId: zora.id,
});

describe("create-helper", () => {
  anvilTest(
    "creates a new 1155 contract and token",
    async ({ viemClients: { publicClient, walletClient, chain } }) => {
      const addresses = await walletClient.getAddresses();
      const creatorAddress = addresses[0]!;

      const creatorClient = createCreatorClient({
        chainId: chain.id,
        publicClient: publicClient,
      });
      const { parameters, contractAddress: collectionAddress } =
        await creatorClient.create1155({
          contract: {
            name: "testContract",
            uri: demoContractMetadataURI,
          },
          token: {
            tokenMetadataURI: demoTokenMetadataURI,
            mintToCreatorCount: 1,
          },
          account: creatorAddress,
        });
      const { request } = await publicClient.simulateContract(parameters);
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt).not.toBeNull();
      expect(receipt.to).to.equal("0x777777c338d93e2c7adf08d102d45ca7cc4ed021");
      expect(getTokenIdFromCreateReceipt(receipt)).to.be.equal(1n);
      expect(getContractAddressFromReceipt(receipt)).to.be.equal(
        collectionAddress,
      );
    },
    20 * 1000,
  );
  anvilTest(
    "creates a new contract, then can create a new token on this existing contract",
    async ({ viemClients: { publicClient, walletClient, chain } }) => {
      const addresses = await walletClient.getAddresses();
      const creatorAccount = addresses[0]!;

      const creatorClient = createCreatorClient({
        chainId: chain.id,
        publicClient: publicClient,
      });

      const { parameters: request, contractAddress: contractAddress } =
        await creatorClient.create1155({
          contract: {
            name: "testContract2",
            uri: demoContractMetadataURI,
          },
          token: {
            tokenMetadataURI: demoTokenMetadataURI,
            mintToCreatorCount: 3,
          },
          account: creatorAccount,
        });
      const { request: simulateResponse } =
        await publicClient.simulateContract(request);
      const hash = await walletClient.writeContract(simulateResponse);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const firstTokenId = getTokenIdFromCreateReceipt(receipt);
      expect(firstTokenId).to.be.equal(1n);
      expect(receipt).not.toBeNull();

      // creator should have mint to creator count balance
      expect(
        await publicClient.readContract({
          address: contractAddress,
          abi: zoraCreator1155ImplABI,
          functionName: "balanceOf",
          args: [creatorAccount, firstTokenId!],
        }),
      ).toBe(3n);

      const newTokenOnExistingContract =
        await creatorClient.create1155OnExistingContract({
          contractAddress: contractAddress,
          token: {
            tokenMetadataURI: demoTokenMetadataURI,
            mintToCreatorCount: 2,
          },
          account: creatorAccount,
        });
      const { request: simulateRequest } = await publicClient.simulateContract(
        newTokenOnExistingContract.parameters,
      );
      const newHash = await walletClient.writeContract(simulateRequest);
      const newReceipt = await publicClient.waitForTransactionReceipt({
        hash: newHash,
      });
      const tokenId = getTokenIdFromCreateReceipt(newReceipt);
      expect(tokenId).to.be.equal(2n);
      expect(newReceipt).not.toBeNull();
    },
    20 * 1000,
  );
  anvilTest(
    "creates a new token with a create referral address",
    async ({ viemClients: { publicClient, walletClient, chain } }) => {
      const addresses = await walletClient.getAddresses();
      const creatorAddress = addresses[0]!;
      const createReferral = addresses[1]!;

      const creatorClient = createCreatorClient({
        chainId: chain.id,
        publicClient: publicClient,
      });
      const {
        parameters: request,
        contractAddress: collectionAddress,
        newTokenId,
      } = await creatorClient.create1155({
        contract: {
          name: "testContract",
          uri: demoContractMetadataURI,
        },
        token: {
          tokenMetadataURI: demoTokenMetadataURI,
          createReferral,
        },
        account: creatorAddress,
      });
      const { request: simulationResponse } =
        await publicClient.simulateContract(request);
      const hash = await walletClient.writeContract(simulationResponse);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt).not.toBeNull();
      expect(receipt.to).to.equal("0x777777c338d93e2c7adf08d102d45ca7cc4ed021");
      expect(getTokenIdFromCreateReceipt(receipt)).to.be.equal(newTokenId);

      expect(
        await publicClient.readContract({
          abi: zoraCreator1155ImplABI,
          address: collectionAddress,
          functionName: "createReferrals",
          args: [newTokenId],
        }),
      ).to.be.equal(createReferral);
    },
    20 * 1000,
  );

  anvilTest(
    "creates a new 1155 free mint that can be minted",
    async ({
      viemClients: { testClient, publicClient, walletClient, chain },
    }) => {
      const addresses = await walletClient.getAddresses();
      const creatorAddress = addresses[0]!;

      const creatorClient = createCreatorClient({
        chainId: chain.id,
        publicClient: publicClient,
      });
      const {
        parameters: request,
        newTokenId,
        newToken,
        minter,
        contractAddress: collectionAddress,
        contractVersion,
      } = await creatorClient.create1155({
        contract: {
          name: "testContract",
          uri: demoContractMetadataURI,
        },
        token: {
          tokenMetadataURI: demoTokenMetadataURI,
        },
        account: creatorAddress,
      });
      const { request: createSimulation } =
        await publicClient.simulateContract(request);
      await waitForSuccess(
        await walletClient.writeContract(createSimulation),
        publicClient,
      );

      const salesConfigAndTokenInfo: MintableParameters = {
        mintFeePerQuantity: parseEther("0.000777"),
        contractVersion,
        salesConfig: {
          saleType: "fixedPrice",
          address: minter,
          pricePerToken: newToken.salesConfig.pricePerToken,
          // these dont matter
          maxTokensPerAddress: 0n,
          saleEnd: "",
          saleStart: "",
        },
      };

      const quantityToMint = 5n;

      // now try to mint a free mint
      const minterAddress = addresses[1]!;

      await testClient.setBalance({
        address: minterAddress,
        value: parseEther("10"),
      });

      const mintParams = makePrepareMint1155TokenParams({
        tokenContract: collectionAddress,
        minterAccount: minterAddress,
        tokenId: newTokenId,
        salesConfigAndTokenInfo,
        quantityToMint,
      });

      const { request: collectSimulation } =
        await publicClient.simulateContract(mintParams);
      await waitForSuccess(
        await walletClient.writeContract(collectSimulation),
        publicClient,
      );
    },
    20 * 1000,
  );

  anvilTest(
    "creates a new 1155 paid mint that can be minted",
    async ({
      viemClients: { testClient, publicClient, walletClient, chain },
    }) => {
      const addresses = await walletClient.getAddresses();
      const creatorAddress = addresses[0]!;

      const creatorClient = createCreatorClient({
        chainId: chain.id,
        publicClient: publicClient,
      });

      const pricePerToken = parseEther("0.01");

      const {
        parameters: request,
        contractAddress: collectionAddress,
        newTokenId,
        newToken,
        minter,
        contractVersion,
      } = await creatorClient.create1155({
        contract: {
          name: "testContract",
          uri: demoContractMetadataURI,
        },
        token: {
          tokenMetadataURI: demoTokenMetadataURI,
          salesConfig: {
            pricePerToken,
          },
        },
        account: creatorAddress,
      });
      const { request: createSimulation } =
        await publicClient.simulateContract(request);
      await waitForSuccess(
        await walletClient.writeContract(createSimulation),
        publicClient,
      );

      const salesConfigAndTokenInfo: MintableParameters = {
        mintFeePerQuantity: parseEther("0.000777"),
        contractVersion,
        salesConfig: {
          saleType: "fixedPrice",
          address: minter,
          pricePerToken: newToken.salesConfig.pricePerToken,
          // these dont matter
          maxTokensPerAddress: 0n,
          saleEnd: "",
          saleStart: "",
        },
      };

      const quantityToMint = 5n;

      // now try to mint a free mint
      const minterAddress = addresses[1]!;

      await testClient.setBalance({
        address: minterAddress,
        value: parseEther("10"),
      });

      const mintParams = makePrepareMint1155TokenParams({
        tokenContract: collectionAddress,
        minterAccount: minterAddress,
        tokenId: newTokenId,
        salesConfigAndTokenInfo,
        quantityToMint,
      });

      const { request: collectSimulation } =
        await publicClient.simulateContract(mintParams);
      await waitForSuccess(
        await walletClient.writeContract(collectSimulation),
        publicClient,
      );
    },
    20 * 1000,
  );
});
