package com.subscriptionmanager.service.lifecycle;

import com.subscriptionmanager.entity.Subscription;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Component
public class ChangeMsisdnAction implements LifecycleAction {

    private static final Pattern MSISDN_PATTERN = Pattern.compile("^\\+?\\d{8,15}$");

    @Override
    public String getType() { return "CHANGE_MSISDN"; }

    @Override
    public List<String> eligibleStatuses() { return List.of("AC", "TR"); }

    @Override
    public void validate(Subscription subscription, Map<String, Object> data) {
        Object msisdn = data.get("msisdn");
        if (!(msisdn instanceof String) || !MSISDN_PATTERN.matcher((String) msisdn).matches()) {
            throw new LifecycleActionValidationException("msisdn", "msisdn must be a valid phone number");
        }
    }

    @Override
    public String apply(Subscription subscription, Map<String, Object> data) {
        String oldMsisdn = subscription.getMsisdn();
        String newMsisdn = (String) data.get("msisdn");
        subscription.setMsisdn(newMsisdn);
        return (oldMsisdn == null ? "none" : oldMsisdn) + " -> " + newMsisdn;
    }
}
