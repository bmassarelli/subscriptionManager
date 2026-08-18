package com.subscriptionmanager.service.lifecycle;

import com.subscriptionmanager.entity.Subscription;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class ChangeSimAction implements LifecycleAction {

    @Override
    public String getType() { return "CHANGE_SIM"; }

    @Override
    public List<String> eligibleStatuses() { return List.of("AC", "TR"); }

    @Override
    public void validate(Subscription subscription, Map<String, Object> data) {
        Object simIccid = data.get("simIccid");
        if (!(simIccid instanceof String) || ((String) simIccid).isBlank()) {
            throw new LifecycleActionValidationException("simIccid", "simIccid is required");
        }
    }

    @Override
    public String apply(Subscription subscription, Map<String, Object> data) {
        String oldSim = subscription.getSimIccid();
        String newSim = (String) data.get("simIccid");
        subscription.setSimIccid(newSim);
        return (oldSim == null ? "none" : oldSim) + " -> " + newSim;
    }
}
