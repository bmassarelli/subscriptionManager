package com.subscriptionmanager.service.lifecycle;

import com.subscriptionmanager.dto.LifecycleActionResultDTO;
import com.subscriptionmanager.dto.OperationDTO;
import com.subscriptionmanager.entity.Operation;
import com.subscriptionmanager.entity.Subscription;
import com.subscriptionmanager.repository.OperationRepository;
import com.subscriptionmanager.repository.SubscriptionRepository;
import com.subscriptionmanager.service.OperationMapper;
import com.subscriptionmanager.service.OperationRecorder;
import com.subscriptionmanager.service.SubscriptionService;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class LifecycleActionService {

    private final SubscriptionRepository subscriptionRepository;
    private final OperationRepository operationRepository;
    private final OperationRecorder operationRecorder;
    private final SubscriptionService subscriptionService;
    private final LifecycleActionRegistry registry;

    public LifecycleActionService(SubscriptionRepository subscriptionRepository,
                                   OperationRepository operationRepository,
                                   OperationRecorder operationRecorder,
                                   SubscriptionService subscriptionService,
                                   LifecycleActionRegistry registry) {
        this.subscriptionRepository = subscriptionRepository;
        this.operationRepository = operationRepository;
        this.operationRecorder = operationRecorder;
        this.subscriptionService = subscriptionService;
        this.registry = registry;
    }

    public LifecycleActionResultDTO executeProductAction(Long subscriptionId, String type, Map<String, Object> data) {
        return execute(subscriptionId, type, data, LifecycleDomain.PRODUCT);
    }

    public LifecycleActionResultDTO executeServiceAction(Long subscriptionId, String type, Map<String, Object> data) {
        return execute(subscriptionId, type, data, LifecycleDomain.SERVICE);
    }

    private LifecycleActionResultDTO execute(Long subscriptionId, String type, Map<String, Object> data, LifecycleDomain requiredDomain) {
        Subscription subscription = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new SubscriptionNotFoundException(
                        "No subscription exists with id " + subscriptionId));

        LifecycleAction action = registry.get(type);
        if (action == null) {
            throw new UnknownLifecycleActionException("Unknown action type: " + type);
        }

        if (action.domain() != requiredDomain) {
            throw new WrongLifecycleDomainException(
                    "Action type " + type + " does not belong to the " + requiredDomain + " domain");
        }

        if (!action.eligibleStatuses().contains(subscription.getStatus())) {
            throw new InvalidLifecycleTransitionException(
                    "Cannot apply " + type + " to a subscription with status " + subscription.getStatus());
        }

        try {
            action.validate(subscription, data);
        } catch (LifecycleActionValidationException e) {
            operationRecorder.record(subscription, type, "FAILED", e.getMessage(), null, data);
            throw e;
        }

        String description = action.apply(subscription, data);
        subscription.setModifyDate(LocalDate.now());
        Subscription saved = subscriptionRepository.save(subscription);
        Operation operation = operationRecorder.record(saved, type, "COMPLETED", null, description, data);

        return new LifecycleActionResultDTO(subscriptionService.toDTO(saved), OperationMapper.toDTO(operation));
    }

    public List<OperationDTO> getOperations(Long subscriptionId) {
        return operationRepository.findBySubscriptionIdOrderByCreatedDateDesc(subscriptionId)
                .stream()
                .map(OperationMapper::toDTO)
                .collect(Collectors.toList());
    }

    public List<OperationDTO> getAllOperations() {
        return operationRepository.findAllByOrderByCreatedDateDesc()
                .stream()
                .map(OperationMapper::toDTO)
                .collect(Collectors.toList());
    }
}
