package com.subscriptionmanager.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subscriptionmanager.dto.ClientResponseDTO;
import com.subscriptionmanager.service.ClientHasSubscriptionsException;
import com.subscriptionmanager.service.ClientNotFoundException;
import com.subscriptionmanager.service.ClientService;
import com.subscriptionmanager.service.DuplicateClientFieldException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ClientController.class)
class ClientControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private ClientService clientService;

    @Test
    void listsAllClients() throws Exception {
        when(clientService.getAll()).thenReturn(List.of(
                new ClientResponseDTO(1L, "John", "Doe", "john.doe@example.com", "+11234567890"),
                new ClientResponseDTO(2L, "Jane", "Smith", "jane.smith@example.com", "+19876543210")));

        mockMvc.perform(get("/api/clients"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].clientId").value(1))
                .andExpect(jsonPath("$[1].clientId").value(2));
    }

    @Test
    void listsEmptyWhenNoClientsExist() throws Exception {
        when(clientService.getAll()).thenReturn(List.of());

        mockMvc.perform(get("/api/clients"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void createsClientAndReturnsGeneratedId() throws Exception {
        when(clientService.create(any())).thenReturn(
                new ClientResponseDTO(1L, "John", "Doe", "john.doe@example.com", "+11234567890"));

        Map<String, String> body = Map.of(
                "name", "John",
                "lastName", "Doe",
                "email", "john.doe@example.com",
                "msisdn", "+11234567890");

        mockMvc.perform(post("/api/clients")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.clientId").value(1))
                .andExpect(jsonPath("$.name").value("John"));
    }

    @Test
    void rejectsRequestMissingRequiredField() throws Exception {
        Map<String, String> body = Map.of(
                "lastName", "Doe",
                "email", "john.doe@example.com",
                "msisdn", "+11234567890");

        mockMvc.perform(post("/api/clients")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.name").exists());
    }

    @Test
    void rejectsMalformedEmail() throws Exception {
        Map<String, String> body = Map.of(
                "name", "John",
                "lastName", "Doe",
                "email", "not-an-email",
                "msisdn", "+11234567890");

        mockMvc.perform(post("/api/clients")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.email").exists());
    }

    @Test
    void rejectsMalformedMsisdn() throws Exception {
        Map<String, String> body = Map.of(
                "name", "John",
                "lastName", "Doe",
                "email", "john.doe@example.com",
                "msisdn", "not-a-phone-number");

        mockMvc.perform(post("/api/clients")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.msisdn").exists());
    }

    @Test
    void rejectsDuplicateEmail() throws Exception {
        when(clientService.create(any()))
                .thenThrow(new DuplicateClientFieldException("email", "A client with this email already exists"));

        Map<String, String> body = Map.of(
                "name", "John",
                "lastName", "Doe",
                "email", "john.doe@example.com",
                "msisdn", "+11234567890");

        mockMvc.perform(post("/api/clients")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.email").exists());
    }

    @Test
    void rejectsDuplicateMsisdn() throws Exception {
        when(clientService.create(any()))
                .thenThrow(new DuplicateClientFieldException("msisdn", "A client with this msisdn already exists"));

        Map<String, String> body = Map.of(
                "name", "John",
                "lastName", "Doe",
                "email", "john.doe@example.com",
                "msisdn", "+11234567890");

        mockMvc.perform(post("/api/clients")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.msisdn").exists());
    }

    @Test
    void ignoresClientSuppliedIdentifier() throws Exception {
        when(clientService.create(any())).thenReturn(
                new ClientResponseDTO(1L, "John", "Doe", "john.doe@example.com", "+11234567890"));

        String body = """
                {
                  "clientId": 999,
                  "name": "John",
                  "lastName": "Doe",
                  "email": "john.doe@example.com",
                  "msisdn": "+11234567890"
                }
                """;

        mockMvc.perform(post("/api/clients")
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.clientId").value(1));
    }

    @Test
    void getsClientById() throws Exception {
        when(clientService.getById(1L)).thenReturn(
                new ClientResponseDTO(1L, "John", "Doe", "john.doe@example.com", "+11234567890"));

        mockMvc.perform(get("/api/clients/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("John"));
    }

    @Test
    void returns404ForNonExistentClientOnGetById() throws Exception {
        when(clientService.getById(999L)).thenThrow(new ClientNotFoundException("No client exists with id 999"));

        mockMvc.perform(get("/api/clients/999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.clientId").exists());
    }

    @Test
    void updatesClientAndReturnsUpdatedData() throws Exception {
        when(clientService.update(eq(1L), any())).thenReturn(
                new ClientResponseDTO(1L, "Jane", "Doe", "john.doe@example.com", "+11234567890"));

        Map<String, String> body = Map.of(
                "name", "Jane",
                "lastName", "Doe",
                "email", "john.doe@example.com",
                "msisdn", "+11234567890");

        mockMvc.perform(put("/api/clients/1")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Jane"));
    }

    @Test
    void returns404ForNonExistentClientOnUpdate() throws Exception {
        when(clientService.update(eq(999L), any()))
                .thenThrow(new ClientNotFoundException("No client exists with id 999"));

        Map<String, String> body = Map.of(
                "name", "Jane",
                "lastName", "Doe",
                "email", "john.doe@example.com",
                "msisdn", "+11234567890");

        mockMvc.perform(put("/api/clients/999")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.clientId").exists());
    }

    @Test
    void rejectsUpdateWithDuplicateEmail() throws Exception {
        when(clientService.update(eq(1L), any()))
                .thenThrow(new DuplicateClientFieldException("email", "A client with this email already exists"));

        Map<String, String> body = Map.of(
                "name", "Jane",
                "lastName", "Doe",
                "email", "john.doe@example.com",
                "msisdn", "+11234567890");

        mockMvc.perform(put("/api/clients/1")
                        .contentType("application/json")
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.email").exists());
    }

    @Test
    void deletesClientSuccessfully() throws Exception {
        mockMvc.perform(delete("/api/clients/1"))
                .andExpect(status().isNoContent());
    }

    @Test
    void returns409WhenClientHasSubscriptions() throws Exception {
        org.mockito.Mockito.doThrow(new ClientHasSubscriptionsException("Cannot delete client 1: 2 subscription(s) exist"))
                .when(clientService).delete(1L);

        mockMvc.perform(delete("/api/clients/1"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.clientId").exists());
    }

    @Test
    void returns404ForNonExistentClientOnDelete() throws Exception {
        org.mockito.Mockito.doThrow(new ClientNotFoundException("No client exists with id 999"))
                .when(clientService).delete(999L);

        mockMvc.perform(delete("/api/clients/999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.clientId").exists());
    }
}
