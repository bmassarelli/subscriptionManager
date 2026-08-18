package com.subscriptionmanager.controller;

import com.subscriptionmanager.entity.PaymentMode;
import com.subscriptionmanager.entity.Platform;
import com.subscriptionmanager.repository.PaymentModeRepository;
import com.subscriptionmanager.repository.PlatformRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(CatalogController.class)
class CatalogControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private PlatformRepository platformRepository;

    @MockBean
    private PaymentModeRepository paymentModeRepository;

    @Test
    void listsPlatforms() throws Exception {
        when(platformRepository.findAll()).thenReturn(List.of(
                new Platform(1L, "MOBILE_BSCS9"),
                new Platform(2L, "FIXED_BSCS7")));

        mockMvc.perform(get("/api/platforms"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("MOBILE_BSCS9"));
    }

    @Test
    void listsPaymentModes() throws Exception {
        when(paymentModeRepository.findAll()).thenReturn(List.of(
                new PaymentMode(1L, "OCC"),
                new PaymentMode(2L, "Saldo")));

        mockMvc.perform(get("/api/payment-modes"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].name").value("OCC"));
    }
}
