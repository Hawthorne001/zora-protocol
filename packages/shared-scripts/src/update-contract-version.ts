#!/usr/bin/env tsx
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const makePackageVersionFile = async (
  version: string,
  destinationFile: string,
  solcVersion: string,
) => {
  console.log("updating contract version to ", version);
  // read the version from the root package.json:

  const packageVersionCode = `// This file is automatically generated by code; do not manually update
// SPDX-License-Identifier: MIT
pragma solidity ${solcVersion};

import {IVersionedContract} from "@zoralabs/shared-contracts/interfaces/IVersionedContract.sol";

/// @title ContractVersionBase
/// @notice Base contract for versioning contracts
contract ContractVersionBase is IVersionedContract {
    /// @notice The version of the contract
    function contractVersion() external pure override returns (string memory) {
        return "${version}";
    }
}
`;

  console.log("generated contract version code:", packageVersionCode);
  console.log("writing file to", destinationFile);

  await writeFile(destinationFile, packageVersionCode);
};

const getVersion = async (packageJsonPath: string) => {
  // read package.json file, parse json, then get version:
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8"));

  return packageJson.version;
};

const getSolcVersion = async (destinationFile: string): Promise<string> => {
  const fileContents = await readFile(destinationFile, "utf-8");
  const solcVersionMatch = fileContents.match(
    /pragma solidity (\^?\d+\.\d+\.\d+);/,
  );
  if (!solcVersionMatch) {
    throw new Error("no solc version found in destination file");
  }
  return solcVersionMatch[1]!;
};

export const updateContractVersion = async (
  projectPath: string = process.cwd(),
) => {
  const packageJsonPath = join(projectPath, "package.json");
  const destinationFile = join(
    projectPath,
    "src",
    "version",
    "ContractVersionBase.sol",
  );

  const version = await getVersion(packageJsonPath);
  const solcVersion = await getSolcVersion(destinationFile);
  await makePackageVersionFile(version, destinationFile, solcVersion);
};

const isMainModule = import.meta.url.startsWith("file:");
if (isMainModule) {
  updateContractVersion().catch(console.error);
}
