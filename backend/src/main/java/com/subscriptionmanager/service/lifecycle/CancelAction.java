package com.subscriptionmanager.service.lifecycle;

import com.subscriptionmanager.entity.Subscription;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Component
public class CancelAction implements LifecycleAction {

    @Override
    public String getType() { return "CANCEL"; }

    @Override
    public List<String> eligibleStatuses() { return List.of("AC", "TR", "SU"); }

    @Override
    public void validate(Subscription subscription, Map<String, Object> data) {
        Object immediate = data.get("immediate");
        if (!(immediate instanceof Boolean)) {
            throw new LifecycleActionValidationException("immediate", "immediate is required and must be true or false");
        }
    }

    @Override
    public String apply(Subscription subscription, Map<String, Object> data) {
        String from = subscription.getStatus();
        boolean immediate = (Boolean) data.get("immediate");
        LocalDate today = LocalDate.now();

        subscription.setStatus("CA");
        subscription.setCancelDate(today);
        if (immediate) {
            subscription.setDeactivateDate(today);
        }

        return from + " -> CA" + (immediate ? " (immediate)" : "");
    }
}
