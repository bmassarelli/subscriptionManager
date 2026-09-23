package com.subscriptionmanager.service.lifecycle;

import com.subscriptionmanager.entity.Subscription;
import com.subscriptionmanager.repository.PlatformRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class ChangePlanAction implements LifecycleAction {

    private final PlatformRepository platformRepository;

    public ChangePlanAction(PlatformRepository platformRepository) {
        this.platformRepository = platformRepository;
    }

    @Override
    public String getType() { return "CHANGE_PLAN"; }

    @Override
    public LifecycleDomain domain() { return LifecycleDomain.SERVICE; }

    @Override
    public List<String> eligibleStatuses() { return List.of("AC", "TR"); }

    @Override
    public void validate(Subscription subscription, Map<String, Object> data) {
        Object platform = data.get("platform");
        if (!(platform instanceof String) || ((String) platform).isBlank()) {
            throw new LifecycleActionValidationException("platform", "platform is required");
        }
        if (platformRepository.findByName((String) platform).isEmpty()) {
            throw new LifecycleActionValidationException("platform", "No platform exists with name " + platform);
        }
    }

    @Override
    public String apply(Subscription subscription, Map<String, Object> data) {
        String oldPlatform = subscription.getService().getPlatform();
        String newPlatform = (String) data.get("platform");
        subscription.getService().setPlatform(newPlatform);

        Object contract = data.get("contract");
        if (contract instanceof String && !((String) contract).isBlank()) {
            subscription.setContract((String) contract);
        }

        return oldPlatform + " -> " + newPlatform;
    }
}
