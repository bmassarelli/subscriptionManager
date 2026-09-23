package com.subscriptionmanager.service.lifecycle;

import com.subscriptionmanager.entity.Subscription;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class PaymentReceivedAction implements LifecycleAction {

    @Override
    public String getType() { return "PAYMENT_RECEIVED"; }

    @Override
    public LifecycleDomain domain() { return LifecycleDomain.PRODUCT; }

    @Override
    public List<String> eligibleStatuses() { return List.of("EX"); }

    @Override
    public void validate(Subscription subscription, Map<String, Object> data) {
        // no additional data required
    }

    @Override
    public String apply(Subscription subscription, Map<String, Object> data) {
        subscription.setStatus("AC");
        return "EX -> AC";
    }
}
