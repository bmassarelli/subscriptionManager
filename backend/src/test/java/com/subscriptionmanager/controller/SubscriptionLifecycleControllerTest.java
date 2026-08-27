package com.subscriptionmanager.controller;

import com.subscriptionmanager.dto.LifecycleActionResultDTO;
import com.subscriptionmanager.dto.OperationDTO;
import com.subscriptionmanager.dto.SubscriptionDTO;
import com.subscriptionmanager.service.lifecycle.InvalidLifecycleTransitionException;
import com.subscriptionmanager.service.lifecycle.LifecycleActionService;
import com.subscriptionmanager.service.lifecycle.LifecycleActionValidationException;
import com.subscriptionmanager.service.lifecycle.SubscriptionNotFoundException;
import com.subscriptionmanager.service.lifecycle.UnknownLifecycleActionException;
import com.subscriptionmanager.service.lifecycle.WrongLifecycleDomainException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SubscriptionLifecycleController.class)
@WithMockUser
class SubscriptionLifecycleControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private LifecycleActionService service;

    @Test
    void executesActionAndPassesTypeAndDataThrough() throws Exception {
        SubscriptionDTO subscriptionDTO = new SubscriptionDTO(1L, "John Doe", "john@doe.com", "+11234567890",
                "MOBILE_BSCS9", "CONTR_001", "SU", LocalDate.now(), new BigDecimal("10.00"), null);
        OperationDTO operationDTO = new OperationDTO(1L, 1L, "John Doe", "SUSPEND", "COMPLETED",
                LocalDateTime.now(), LocalDateTime.now(), null, "AC -> SU");
        when(service.executeProductAction(eq(1L), eq("SUSPEND"), any())).thenReturn(
                new LifecycleActionResultDTO(subscriptionDTO, operationDTO));

        mockMvc.perform(post("/api/subscriptions/1/product-actions")
                        .contentType("application/json")
                        .content("{\"type\":\"SUSPEND\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.subscription.status").value("SU"))
                .andExpect(jsonPath("$.operation.operationType").value("SUSPEND"));
    }

    @Test
    void passesActionSpecificFieldsIntoData() throws Exception {
        SubscriptionDTO subscriptionDTO = new SubscriptionDTO(1L, "John Doe", "john@doe.com", "+11234567890",
                "MOBILE_BSCS9", "CONTR_001", "CA", LocalDate.now(), new BigDecimal("10.00"), null);
        OperationDTO operationDTO = new OperationDTO(1L, 1L, "John Doe", "CANCEL", "COMPLETED",
                LocalDateTime.now(), LocalDateTime.now(), null, "AC -> CA");
        when(service.executeProductAction(eq(1L), eq("CANCEL"), any())).thenReturn(
                new LifecycleActionResultDTO(subscriptionDTO, operationDTO));

        mockMvc.perform(post("/api/subscriptions/1/product-actions")
                        .contentType("application/json")
                        .content("{\"type\":\"CANCEL\",\"immediate\":true}"))
                .andExpect(status().isOk());

        verify(service).executeProductAction(eq(1L), eq("CANCEL"), eq(java.util.Map.of("immediate", true)));
    }

    @Test
    void returns404WhenSubscriptionNotFound() throws Exception {
        when(service.executeProductAction(eq(999L), any(), any()))
                .thenThrow(new SubscriptionNotFoundException("No subscription exists with id 999"));

        mockMvc.perform(post("/api/subscriptions/999/product-actions")
                        .contentType("application/json")
                        .content("{\"type\":\"SUSPEND\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void returns400ForUnknownActionType() throws Exception {
        when(service.executeProductAction(eq(1L), eq("FOO"), any()))
                .thenThrow(new UnknownLifecycleActionException("Unknown action type: FOO"));

        mockMvc.perform(post("/api/subscriptions/1/product-actions")
                        .contentType("application/json")
                        .content("{\"type\":\"FOO\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").exists());
    }

    @Test
    void returns400ForWrongDomainActionType() throws Exception {
        when(service.executeProductAction(eq(1L), eq("CHANGE_PLAN"), any()))
                .thenThrow(new WrongLifecycleDomainException(
                        "Action type CHANGE_PLAN does not belong to the PRODUCT domain"));

        mockMvc.perform(post("/api/subscriptions/1/product-actions")
                        .contentType("application/json")
                        .content("{\"type\":\"CHANGE_PLAN\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").exists());
    }

    @Test
    void returns409ForInvalidTransition() throws Exception {
        when(service.executeProductAction(eq(1L), eq("RECONNECT"), any()))
                .thenThrow(new InvalidLifecycleTransitionException(
                        "Cannot apply RECONNECT to a subscription with status AC"));

        mockMvc.perform(post("/api/subscriptions/1/product-actions")
                        .contentType("application/json")
                        .content("{\"type\":\"RECONNECT\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").exists());
    }

    @Test
    void returns400ForActionValidationFailure() throws Exception {
        when(service.executeServiceAction(eq(1L), eq("CHANGE_MSISDN"), any()))
                .thenThrow(new LifecycleActionValidationException("msisdn", "msisdn must be a valid phone number"));

        mockMvc.perform(post("/api/subscriptions/1/service-actions")
                        .contentType("application/json")
                        .content("{\"type\":\"CHANGE_MSISDN\",\"msisdn\":\"abc\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.msisdn").exists());
    }

    @Test
    void listsOperationsForASubscription() throws Exception {
        OperationDTO operationDTO = new OperationDTO(1L, 1L, "John Doe", "CREATE", "COMPLETED",
                LocalDateTime.now(), LocalDateTime.now(), null, "Subscription created");
        when(service.getOperations(1L)).thenReturn(List.of(operationDTO));

        mockMvc.perform(get("/api/subscriptions/1/operations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].operationType").value("CREATE"));
    }

    @Test
    void listsAllOperationsAcrossSubscriptions() throws Exception {
        OperationDTO first = new OperationDTO(2L, 2L, "Jane Roe", "SUSPEND", "COMPLETED",
                LocalDateTime.now(), LocalDateTime.now(), null, "AC -> SU");
        OperationDTO second = new OperationDTO(1L, 1L, "John Doe", "CREATE", "COMPLETED",
                LocalDateTime.now().minusHours(1), LocalDateTime.now().minusHours(1), null, "Subscription created");
        when(service.getAllOperations()).thenReturn(List.of(first, second));

        mockMvc.perform(get("/api/operations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].operationType").value("SUSPEND"))
                .andExpect(jsonPath("$[1].operationType").value("CREATE"));
    }

    @Test
    void listsEmptyWhenNoOperationsExist() throws Exception {
        when(service.getAllOperations()).thenReturn(List.of());

        mockMvc.perform(get("/api/operations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
