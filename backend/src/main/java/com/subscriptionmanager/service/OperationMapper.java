package com.subscriptionmanager.service;

import com.subscriptionmanager.dto.OperationDTO;
import com.subscriptionmanager.entity.Operation;

public final class OperationMapper {

    private OperationMapper() {
    }

    public static OperationDTO toDTO(Operation o) {
        String clientName = o.getSubscription().getClient().getName() + " "
                + o.getSubscription().getClient().getLastName();
        return new OperationDTO(
                o.getId(),
                o.getSubscription().getId(),
                clientName,
                o.getOperationType(),
                o.getStatus(),
                o.getCreatedDate(),
                o.getUpdatedDate(),
                o.getErrorMessage(),
                o.getDescription()
        );
    }
}
