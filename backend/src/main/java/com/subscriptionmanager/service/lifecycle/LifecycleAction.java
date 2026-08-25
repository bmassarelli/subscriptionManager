package com.subscriptionmanager.service.lifecycle;

import com.subscriptionmanager.entity.Subscription;

import java.util.List;
import java.util.Map;

public interface LifecycleAction {

    String getType();

    default LifecycleDomain domain() { return LifecycleDomain.PRODUCT; }

    List<String> eligibleStatuses();

    void validate(Subscription subscription, Map<String, Object> data);

    String apply(Subscription subscription, Map<String, Object> data);
}
