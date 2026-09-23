package com.subscriptionmanager.service.lifecycle;

import com.subscriptionmanager.entity.Subscription;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class MarkExpiredAction implements LifecycleAction {

    @Override
    public String getType() { return "MARK_EXPIRED"; }

    @Override
    public LifecycleDomain domain() { return LifecycleDomain.PRODUCT; }

    @Override
    public List<String> eligibleStatuses() { return List.of("AC", "TR"); }

    @Override
    public void validate(Subscription subscription, Map<String, Object> data) {
        // no additional data required
    }

    @Override
    public String apply(Subscription subscription, Map<String, Object> data) {
        String from = subscription.getStatus();
        subscription.setStatus("EX");
        return from + " -> EX";
    }
}
