package com.subscriptionmanager.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;

import java.util.HashMap;
import java.util.Map;

public class LifecycleActionRequestDTO {

    private String type;
    private final Map<String, Object> data = new HashMap<>();

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    @JsonAnySetter
    public void addData(String key, Object value) {
        data.put(key, value);
    }

    public Map<String, Object> getData() { return data; }
}
