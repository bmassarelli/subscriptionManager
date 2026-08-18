package com.subscriptionmanager.dto;

public class ResourceDTO {

    private final Long id;
    private final Long subscriptionId;
    private final String resourceType;
    private final String value;

    public ResourceDTO(Long id, Long subscriptionId, String resourceType, String value) {
        this.id = id;
        this.subscriptionId = subscriptionId;
        this.resourceType = resourceType;
        this.value = value;
    }

    public Long getId() { return id; }
    public Long getSubscriptionId() { return subscriptionId; }
    public String getResourceType() { return resourceType; }
    public String getValue() { return value; }
}
