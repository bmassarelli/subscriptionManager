package com.subscriptionmanager.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subscriptionmanager.config.SecurityConfig;
import com.subscriptionmanager.dto.SubscriptionDTO;
import com.subscriptionmanager.repository.AppUserRepository;
import com.subscriptionmanager.service.AppUserDetailsService;
import com.subscriptionmanager.service.InvalidClientReferenceException;
import com.subscriptionmanager.service.InvalidPaymentModeException;
import com.subscriptionmanager.service.InvalidPlatformException;
import com.subscriptionmanager.service.InvalidProductOfferingException;
import com.subscriptionmanager.service.SubscriptionService;
import com.subscriptionmanager.service.lifecycle.SubscriptionNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SubscriptionController.class)
@Import({SecurityConfig.class, AppUserDetailsService.class})
@WithMockUser
class SubscriptionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private SubscriptionService subscriptionService;

    @MockBean
    private AppUserRepository appUserRepository;

    @Test
    void listsAllSubscriptions() throws Exception {
        when(subscriptionService.getAll()).thenReturn(List.of(
                new SubscriptionDTO(1L, "John Doe", "john.doe@example.com", "+11234567890",
                        "MOBILE_BSCS9", "CONTR_00001", "TR", LocalDate.now(), new BigDecimal("29.75"), null)));

        mockMvc.perform(get("/api/subscriptions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(1));
    }

    @Test
    void listsEmptyWhenNoSubscriptionsExist() throws Exception {
        when(subscriptionService.getAll()).thenReturn(List.of());

        mockMvc.perform(get("/api/subscriptions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void createsSubscriptionAndReturnsGeneratedIdAndTrialStatus() throws Exception {
        when(subscriptionService.create(any())).thenReturn(new SubscriptionDTO(
                1L, "John Doe", "john.doe@example.com", "+11234567890",
                "MOBILE_BSCS9", "CONTR_00001", "TR", LocalDate.now(), new BigDecimal("29.75"), null));

        Map<String, Object> body = Map.of(
                "clientId", 1,
                "platform", "MOBILE_BSCS9",
                "contract", "CONTR_00001",
                "amount", 29.75);

        mockMvc.perform(post("/api/subscriptions")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.status").value("TR"))
                .andExpect(jsonPath("$.entryDate").value(LocalDate.now().toString()));
    }

    @Test
    void rejectsRequestMissingRequiredField() throws Exception {
        Map<String, Object> body = Map.of(
                "platform", "MOBILE_BSCS9",
                "contract", "CONTR_00001",
                "amount", 29.75);

        mockMvc.perform(post("/api/subscriptions")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.clientId").exists());
    }

    @Test
    void rejectsNonExistentClient() throws Exception {
        when(subscriptionService.create(any()))
                .thenThrow(new InvalidClientReferenceException("No client exists with id 999"));

        Map<String, Object> body = Map.of(
                "clientId", 999,
                "platform", "MOBILE_BSCS9",
                "contract", "CONTR_00001",
                "amount", 29.75);

        mockMvc.perform(post("/api/subscriptions")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.clientId").exists());
    }

    @Test
    void rejectsNonPositiveAmount() throws Exception {
        Map<String, Object> body = Map.of(
                "clientId", 1,
                "platform", "MOBILE_BSCS9",
                "contract", "CONTR_00001",
                "amount", 0);

        mockMvc.perform(post("/api/subscriptions")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.amount").exists());
    }

    @Test
    void ignoresClientSuppliedIdAndStatus() throws Exception {
        when(subscriptionService.create(any())).thenReturn(new SubscriptionDTO(
                1L, "John Doe", "john.doe@example.com", "+11234567890",
                "MOBILE_BSCS9", "CONTR_00001", "TR", LocalDate.now(), new BigDecimal("29.75"), null));

        String body = """
                {
                  "id": 999,
                  "status": "AC",
                  "clientId": 1,
                  "platform": "MOBILE_BSCS9",
                  "contract": "CONTR_00001",
                  "amount": 29.75
                }
                """;

        mockMvc.perform(post("/api/subscriptions")
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.status").value("TR"));
    }

    @Test
    void rejectsUnknownPlatform() throws Exception {
        when(subscriptionService.create(any()))
                .thenThrow(new InvalidPlatformException("No platform exists with name UNKNOWN_PLATFORM"));

        Map<String, Object> body = Map.of(
                "clientId", 1,
                "platform", "UNKNOWN_PLATFORM",
                "contract", "CONTR_00001",
                "amount", 29.75);

        mockMvc.perform(post("/api/subscriptions")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.platform").exists());
    }

    @Test
    void rejectsUnknownPaymentMode() throws Exception {
        when(subscriptionService.create(any()))
                .thenThrow(new InvalidPaymentModeException("No payment mode exists with id 999"));

        Map<String, Object> body = Map.of(
                "clientId", 1,
                "platform", "MOBILE_BSCS9",
                "contract", "CONTR_00001",
                "amount", 29.75,
                "paymentModeId", 999);

        mockMvc.perform(post("/api/subscriptions")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.paymentModeId").exists());
    }

    @Test
    void acceptsValidPaymentMode() throws Exception {
        when(subscriptionService.create(any())).thenReturn(new SubscriptionDTO(
                1L, "John Doe", "john.doe@example.com", "+11234567890",
                "MOBILE_BSCS9", "CONTR_00001", "TR", LocalDate.now(), new BigDecimal("29.75"), null));

        Map<String, Object> body = Map.of(
                "clientId", 1,
                "platform", "MOBILE_BSCS9",
                "contract", "CONTR_00001",
                "amount", 29.75,
                "paymentModeId", 1);

        mockMvc.perform(post("/api/subscriptions")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1));
    }

    @Test
    void rejectsUnknownProductOffering() throws Exception {
        when(subscriptionService.create(any()))
                .thenThrow(new InvalidProductOfferingException("No product offering exists with name unknownOffering"));

        Map<String, Object> body = Map.of(
                "clientId", 1,
                "platform", "MOBILE_BSCS9",
                "contract", "CONTR_00001",
                "amount", 29.75,
                "po", "unknownOffering");

        mockMvc.perform(post("/api/subscriptions")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.po").exists());
    }

    @Test
    void acceptsValidProductOffering() throws Exception {
        when(subscriptionService.create(any())).thenReturn(new SubscriptionDTO(
                1L, "John Doe", "john.doe@example.com", "+11234567890",
                "MOBILE_BSCS9", "CONTR_00001", "TR", LocalDate.now(), new BigDecimal("29.75"), "claroVideo"));

        Map<String, Object> body = Map.of(
                "clientId", 1,
                "platform", "MOBILE_BSCS9",
                "contract", "CONTR_00001",
                "amount", 29.75,
                "po", "claroVideo");

        mockMvc.perform(post("/api/subscriptions")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.po").value("claroVideo"));
    }

    @Test
    void updatesContractAndAmount() throws Exception {
        when(subscriptionService.update(eq(1L), any())).thenReturn(new SubscriptionDTO(
                1L, "John Doe", "john.doe@example.com", "+11234567890",
                "MOBILE_BSCS9", "CONTR_00002", "TR", LocalDate.now(), new BigDecimal("35.00"), null));

        Map<String, Object> body = Map.of("contract", "CONTR_00002", "amount", 35.00);

        mockMvc.perform(put("/api/subscriptions/1")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contract").value("CONTR_00002"));
    }

    @Test
    void rejectsUpdateMissingRequiredField() throws Exception {
        Map<String, Object> body = Map.of("amount", 35.00);

        mockMvc.perform(put("/api/subscriptions/1")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.contract").exists());
    }

    @Test
    void rejectsUpdateWithNonPositiveAmount() throws Exception {
        Map<String, Object> body = Map.of("contract", "CONTR_00002", "amount", 0);

        mockMvc.perform(put("/api/subscriptions/1")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.amount").exists());
    }

    @Test
    void returns404ForNonExistentSubscriptionOnUpdate() throws Exception {
        when(subscriptionService.update(eq(999L), any()))
                .thenThrow(new SubscriptionNotFoundException("No subscription exists with id 999"));

        Map<String, Object> body = Map.of("contract", "CONTR_00002", "amount", 35.00);

        mockMvc.perform(put("/api/subscriptions/999")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.id").exists());
    }
}
