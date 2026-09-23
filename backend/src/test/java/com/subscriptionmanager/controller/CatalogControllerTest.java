package com.subscriptionmanager.controller;

import com.subscriptionmanager.config.SecurityConfig;
import com.subscriptionmanager.entity.PaymentMode;
import com.subscriptionmanager.entity.Platform;
import com.subscriptionmanager.entity.ProductOffering;
import com.subscriptionmanager.repository.AppUserRepository;
import com.subscriptionmanager.repository.PaymentModeRepository;
import com.subscriptionmanager.repository.PlatformRepository;
import com.subscriptionmanager.repository.ProductOfferingRepository;
import com.subscriptionmanager.service.AppUserDetailsService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(CatalogController.class)
@Import({SecurityConfig.class, AppUserDetailsService.class})
@WithMockUser
class CatalogControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private PlatformRepository platformRepository;

    @MockBean
    private PaymentModeRepository paymentModeRepository;

    @MockBean
    private ProductOfferingRepository productOfferingRepository;

    @MockBean
    private AppUserRepository appUserRepository;

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

    @Test
    void listsProductOfferings() throws Exception {
        when(productOfferingRepository.findAll()).thenReturn(List.of(
                new ProductOffering(1L, "claroVideo")));

        mockMvc.perform(get("/api/product-offerings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("claroVideo"));
    }
}
