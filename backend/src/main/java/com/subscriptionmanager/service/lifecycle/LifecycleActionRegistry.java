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

    public List<String> availableActionsFor(String status) {
        return actions.values().stream()
                .filter(a -> a.eligibleStatuses().contains(status))
                .map(LifecycleAction::getType)
                .sorted()
                .collect(Collectors.toList());
    }
}
