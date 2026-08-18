package com.subscriptionmanager.dto;

import jakarta.validation.constraints.NotBlank;

public class ResourceRequestDTO {

    @NotBlank(message = "resourceType is required")
    private String resourceType;

    @NotBlank(message = "value is required")
    private String value;

    public String getResourceType() { return resourceType; }
    public void setResourceType(String resourceType) { this.resourceType = resourceType; }

    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
}
