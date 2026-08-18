package com.subscriptionmanager.controller;

import com.subscriptionmanager.dto.ResourceDTO;
import com.subscriptionmanager.service.lifecycle.SubscriptionNotFoundException;
import com.subscriptionmanager.service.resource.InvalidResourceTypeException;
import com.subscriptionmanager.service.resource.ResourceNotFoundException;
import com.subscriptionmanager.service.resource.ResourceService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ResourceController.class)
class ResourceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ResourceService service;

    @Test
    void listsResourcesForASubscription() throws Exception {
        when(service.getResources(1L)).thenReturn(List.of(new ResourceDTO(1L, 1L, "IP", "10.0.0.1")));

        mockMvc.perform(get("/api/subscriptions/1/resources"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].resourceType").value("IP"));
    }

    @Test
    void listsEmptyWhenNoneAssigned() throws Exception {
        when(service.getResources(1L)).thenReturn(List.of());

        mockMvc.perform(get("/api/subscriptions/1/resources"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void returns404WhenSubscriptionNotFoundOnList() throws Exception {
        when(service.getResources(999L))
                .thenThrow(new SubscriptionNotFoundException("No subscription exists with id 999"));

        mockMvc.perform(get("/api/subscriptions/999/resources"))
                .andExpect(status().isNotFound());
    }

    @Test
    void addsAResource() throws Exception {
        when(service.addResource(eq(1L), any())).thenReturn(new ResourceDTO(5L, 1L, "VLAN", "100"));

        mockMvc.perform(post("/api/subscriptions/1/resources")
                        .contentType("application/json")
                        .content("{\"resourceType\":\"VLAN\",\"value\":\"100\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.resourceType").value("VLAN"))
                .andExpect(jsonPath("$.value").value("100"));
    }

    @Test
    void returns400ForAnUnrecognizedResourceType() throws Exception {
        when(service.addResource(eq(1L), any()))
                .thenThrow(new InvalidResourceTypeException("resourceType must be one of [...]"));

        mockMvc.perform(post("/api/subscriptions/1/resources")
                        .contentType("application/json")
                        .content("{\"resourceType\":\"BOGUS\",\"value\":\"whatever\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.resourceType").exists());
    }

    @Test
    void returns400WhenValueIsMissing() throws Exception {
        mockMvc.perform(post("/api/subscriptions/1/resources")
                        .contentType("application/json")
                        .content("{\"resourceType\":\"IP\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.value").exists());
    }

    @Test
    void deletesAResource() throws Exception {
        mockMvc.perform(delete("/api/subscriptions/1/resources/7"))
                .andExpect(status().isNoContent());
    }

    @Test
    void returns404WhenDeletingAnUnknownResource() throws Exception {
        doThrow(new ResourceNotFoundException("No resource exists with id 999 for subscription 1"))
                .when(service).deleteResource(1L, 999L);

        mockMvc.perform(delete("/api/subscriptions/1/resources/999"))
                .andExpect(status().isNotFound());
    }
}
