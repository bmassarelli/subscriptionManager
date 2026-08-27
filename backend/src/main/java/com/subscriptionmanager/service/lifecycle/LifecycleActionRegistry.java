package com.subscriptionmanager.service.lifecycle;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
public class LifecycleActionRegistry {

    private final Map<String, LifecycleAction> actions;

    public LifecycleActionRegistry(List<LifecycleAction> actionList) {
        this.actions = actionList.stream().collect(Collectors.toMap(LifecycleAction::getType, a -> a));
    }

    public LifecycleAction get(String type) {
        return actions.get(type);
    }

    public List<String> availableProductActionsFor(String status) {
        return actions.values().stream()
                .filter(a -> a.eligibleStatuses().contains(status))
                .filter(a -> a.domain() == LifecycleDomain.PRODUCT)
                .map(LifecycleAction::getType)
                .sorted()
                .collect(Collectors.toList());
    }

    public List<String> availableServiceActionsFor(String status) {
        return actions.values().stream()
                .filter(a -> a.eligibleStatuses().contains(status))
                .filter(a -> a.domain() == LifecycleDomain.SERVICE)
                .map(LifecycleAction::getType)
                .sorted()
                .collect(Collectors.toList());
    }
}
