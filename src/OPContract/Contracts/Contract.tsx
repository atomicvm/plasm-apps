import { ActionStatus } from "@polkadot/react-components/Status/types";

import React, { useState } from "react";
import styled from "styled-components";
import { RouteComponentProps } from "react-router";
import { withRouter } from "react-router-dom";
import keyring from "@polkadot/ui-keyring";
import { PromiseContract as ApiContract } from "@polkadot/api-contract";
import { AddressRow, Button, Card, Forget, Messages } from "@polkadot/react-components";

import { useApi, useCall } from "@polkadot/react-hooks";
import { Option } from "@polkadot/types";
import { AccountId } from "@polkadot/types/interfaces";

interface Props extends RouteComponentProps {
  basePath: string;
  contract: ApiContract;
  onCall: (_?: number) => () => void;
}

const ContractCard = styled(Card)`
  && {
    min-width: 100%;
    max-width: 100%;
  }
`;

function transformContract(contractId: Option<AccountId>): string {
  const id = contractId.unwrapOr("undefined");
  return id ? id[0].toString() : "undefined";
}

function Contract(props: Props): React.ReactElement<Props> | null {
  const { api } = useApi();
  const {
    contract: { abi, address },
    onCall,
  } = props;
  const operatorId = useCall<string>(api.query.operator?.contractHasOperator, [address.toString()], {
    defaultValue: "undefined",
    transform: transformContract,
  }) as string;

  if (!address || !abi) {
    return null;
  }

  const [isForgetOpen, setIsForgetOpen] = useState(false);

  const _toggleForget = (): void => setIsForgetOpen(!isForgetOpen);
  const _onForget = (): void => {
    if (!address) {
      return;
    }

    const status: Partial<ActionStatus> = {
      account: address,
      action: "forget",
    };

    try {
      keyring.forgetContract(address.toString());
      status.status = "success";
      status.message = "address forgotten";
    } catch (error) {
      status.status = "error";
      status.message = error.message;
    }
    _toggleForget();
  };

  return (
    <ContractCard>
      {isForgetOpen && (
        <Forget
          address={address.toString()}
          mode="contract"
          onForget={_onForget}
          key="modal-forget-contract"
          onClose={_toggleForget}
        />
      )}
      <AddressRow
        buttons={
          <div className="contracts--Contract-buttons">
            <Button icon="trash" isNegative onClick={_toggleForget} size="small" tooltip={"Forget this contract"} />
            <Button
              icon="play"
              isPrimary
              label={"execute"}
              onClick={onCall()}
              size="small"
              tooltip={"Call a method on this contract"}
            />
          </div>
        }
        isContract
        isEditable
        type="contract"
        value={address}
        withBalance={false}
        withNonce={false}
        withTags
      >
        {!!operatorId && <AddressRow value={operatorId} isInline label={"operator"} />}
        <details>
          <summary>{"Messages"}</summary>
          <Messages address={address.toString()} contractAbi={abi} isRemovable={false} onSelect={onCall} />
        </details>
      </AddressRow>
    </ContractCard>
  );
}

export default withRouter(Contract);
