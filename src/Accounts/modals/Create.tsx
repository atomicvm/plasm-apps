import { ActionStatus } from "@polkadot/react-components/Status/types";
import { CreateResult } from "@polkadot/ui-keyring/types";
import { KeypairType } from "@polkadot/util-crypto/types";
import { ModalProps } from "../types";

import FileSaver from "file-saver";
import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { DEV_PHRASE } from "@polkadot/keyring/defaults";
import { AddressRow, Button, Dropdown, Input, InputAddress, Modal, Password } from "@polkadot/react-components";
import { useApi } from "@polkadot/react-hooks";
import keyring from "@polkadot/ui-keyring";
// import uiSettings from "@plasm/ui-settings";
import { isHex, u8aToHex } from "@polkadot/util";
import { keyExtractSuri, mnemonicGenerate, mnemonicValidate, randomAsU8a } from "@polkadot/util-crypto";

import CreateConfirmation from "./CreateConfirmation";

interface Props extends ModalProps {
  className?: string;
  seed?: string;
  type?: KeypairType;
}

type SeedType = "bip" | "raw" | "dev";

interface AddressState {
  address: string | null;
  deriveError: string | null;
  derivePath: string;
  isSeedValid: boolean;
  pairType: KeypairType;
  seed: string;
  seedType: SeedType;
}

interface CreateOptions {
  genesisHash?: string;
  name: string;
  tags?: string[];
}

const DEFAULT_PAIR_TYPE = "sr25519";

function deriveValidate(seed: string, derivePath: string, pairType: KeypairType): string | null {
  try {
    const { path } = keyExtractSuri(`${seed}${derivePath}`);

    // we don't allow soft for ed25519
    if (pairType === "ed25519" && path.some(({ isSoft }): boolean => isSoft)) {
      return "Soft derivation paths are not allowed on ed25519";
    }
  } catch (error) {
    return error.message;
  }

  return null;
}

function isHexSeed(seed: string): boolean {
  return isHex(seed) && seed.length === 66;
}

function rawValidate(seed: string): boolean {
  return (seed.length > 0 && seed.length <= 32) || isHexSeed(seed);
}

function addressFromSeed(phrase: string, derivePath: string, pairType: KeypairType): string {
  return keyring.createFromUri(`${phrase.trim()}${derivePath}`, {}, pairType).address;
}

function newSeed(seed: string | undefined | null, seedType: SeedType): string {
  switch (seedType) {
    case "bip":
      return mnemonicGenerate();
    case "dev":
      return DEV_PHRASE;
    default:
      return seed || u8aToHex(randomAsU8a());
  }
}

function generateSeed(
  _seed: string | undefined | null,
  derivePath: string,
  seedType: SeedType,
  pairType: KeypairType = DEFAULT_PAIR_TYPE
): AddressState {
  const seed = newSeed(_seed, seedType);
  const address = addressFromSeed(seed, derivePath, pairType);

  return {
    address,
    deriveError: null,
    derivePath,
    isSeedValid: true,
    pairType,
    seedType,
    seed,
  };
}

function updateAddress(seed: string, derivePath: string, seedType: SeedType, pairType: KeypairType): AddressState {
  const deriveError = deriveValidate(seed, derivePath, pairType);
  let isSeedValid = seedType === "raw" ? rawValidate(seed) : mnemonicValidate(seed);
  let address: string | null = null;

  if (!deriveError && isSeedValid) {
    try {
      address = addressFromSeed(seed, derivePath, pairType);
    } catch (error) {
      isSeedValid = false;
    }
  }

  return {
    address,
    deriveError,
    derivePath,
    isSeedValid,
    pairType,
    seedType,
    seed,
  };
}

export function downloadAccount({ json, pair }: CreateResult): void {
  const blob = new Blob([JSON.stringify(json)], { type: "application/json; charset=utf-8" });

  FileSaver.saveAs(blob, `${pair.address}.json`);
  InputAddress.setLastValue("account", pair.address);
}

function createAccount(
  suri: string,
  pairType: KeypairType,
  { genesisHash, name, tags = [] }: CreateOptions,
  password: string,
  success: string
): ActionStatus {
  // we will fill in all the details below
  const status = { action: "create" } as ActionStatus;

  try {
    const result = keyring.addUri(suri, password, { genesisHash, name, tags }, pairType);
    const { address } = result.pair;

    status.account = address;
    status.status = "success";
    status.message = success;

    downloadAccount(result);
  } catch (error) {
    status.status = "error";
    status.message = error.message;
  }

  return status;
}

function Create({
  className,
  onClose,
  onStatusChange,
  seed: propsSeed,
  type: propsType,
}: Props): React.ReactElement<Props> {
  const { api, isDevelopment } = useApi();
  const [{ address, deriveError, derivePath, isSeedValid, pairType, seed, seedType }, setAddress] = useState<
    AddressState
  >(generateSeed(propsSeed, "", propsSeed ? "raw" : "bip", propsType));
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [{ isNameValid, name }, setName] = useState({ isNameValid: false, name: "" });
  const [{ isPassValid, password }, setPassword] = useState({ isPassValid: false, password: "" });
  const isValid = !!address && !deriveError && isNameValid && isPassValid && isSeedValid;
  const seedOpt = useMemo(
    () =>
      (isDevelopment ? [{ value: "dev", text: "Development" }] : []).concat(
        { value: "bip", text: "Mnemonic" },
        { value: "raw", text: "Raw seed" }
      ),
    [isDevelopment]
  );

  const _onChangePass = (password: string): void =>
    setPassword({ isPassValid: keyring.isPassValid(password), password });
  const _onChangeDerive = (newDerivePath: string): void =>
    setAddress(updateAddress(seed, newDerivePath, seedType, pairType));
  const _onChangeSeed = (newSeed: string): void => setAddress(updateAddress(newSeed, derivePath, seedType, pairType));
  const _onChangePairType = (newPairType: KeypairType): void =>
    setAddress(updateAddress(seed, derivePath, seedType, newPairType));
  const _selectSeedType = (newSeedType: SeedType): void => {
    if (newSeedType !== seedType) {
      setAddress(generateSeed(null, derivePath, newSeedType, pairType));
    }
  };
  const _onChangeName = (name: string): void => setName({ isNameValid: !!name.trim(), name });
  const _toggleConfirmation = (): void => setIsConfirmationOpen(!isConfirmationOpen);

  const _onCommit = (): void => {
    if (!isValid) {
      return;
    }

    const options = { genesisHash: isDevelopment ? undefined : api.genesisHash.toString(), name: name.trim() };
    const status = createAccount(`${seed}${derivePath}`, pairType, options, password, "created account");

    _toggleConfirmation();
    onStatusChange(status);
    onClose();
  };

  return (
    <Modal className={className} header={"Add an account via seed"}>
      {address && isConfirmationOpen && (
        <CreateConfirmation address={address} name={name} onCommit={_onCommit} onClose={_toggleConfirmation} />
      )}
      <Modal.Content>
        <AddressRow defaultName={name} noDefaultNameOpacity value={isSeedValid ? address : ""}>
          <Input
            autoFocus
            className="full"
            help={
              'Name given to this account. You can edit it. To use the account to validate or nominate, it is a good practice to append the function of the account in the name, e.g "name_you_want - stash".'
            }
            isError={!isNameValid}
            label={"name"}
            onChange={_onChangeName}
            onEnter={_onCommit}
            placeholder={"new account"}
            value={name}
          />
          <Input
            className="full"
            help={
              'The private key for your account is derived from this seed. This seed must be kept secret as anyone in its possession has access to the funds of this account. If you validate, use the seed of the session account as the "--key" parameter of your node.'
            }
            isAction
            isError={!isSeedValid}
            isReadOnly={seedType === "dev"}
            label={
              seedType === "bip" ? "mnemonic seed" : seedType === "dev" ? "development seed" : "seed (hex or string)"
            }
            onChange={_onChangeSeed}
            onEnter={_onCommit}
            value={seed}
          >
            <Dropdown isButton defaultValue={seedType} onChange={_selectSeedType} options={seedOpt} />
          </Input>
          <Password
            className="full"
            help={
              "This password is used to encrypt your private key. It must be strong and unique! You will need it to sign transactions with this account. You can recover this account using this password together with the backup file (generated in the next step)."
            }
            isError={!isPassValid}
            label={"password"}
            onChange={_onChangePass}
            onEnter={_onCommit}
            value={password}
          />
          <details className="accounts--Creator-advanced" open>
            <summary>{"Advanced creation options"}</summary>
            <Dropdown
              defaultValue={pairType}
              help={
                'Determines what cryptography will be used to create this account. Note that to validate on Polkadot, the session account must use "ed25519".'
              }
              label={"keypair crypto type"}
              onChange={_onChangePairType}
              options={[
                {
                  info: "ed25519",
                  text: "Edwards (ed25519)",
                  value: "ed25519",
                },
                {
                  info: "sr25519",
                  text: "Schnorrkel (sr25519)",
                  value: "sr25519",
                },
              ]}
            />
            <Input
              className="full"
              help={
                'You can set a custom derivation path for this account using the following syntax "/<soft-key>//<hard-key>///<password>". The "/<soft-key>" and "//<hard-key>" may be repeated and mixed`. The "///password" is optional and should only occur once.'
              }
              isError={!!deriveError}
              label={"secret derivation path"}
              onChange={_onChangeDerive}
              onEnter={_onCommit}
              placeholder={"//hard/soft///password"}
              value={derivePath}
            />
            {deriveError && <article className="error">{deriveError}</article>}
          </details>
        </AddressRow>
      </Modal.Content>
      <Modal.Actions onCancel={onClose}>
        <Button icon="plus" isDisabled={!isValid} isPrimary label={"Save"} onClick={_toggleConfirmation} />
      </Modal.Actions>
    </Modal>
  );
}

export default styled(Create)`
  .accounts--Creator-advanced {
    margin-top: 1rem;
  }
`;
