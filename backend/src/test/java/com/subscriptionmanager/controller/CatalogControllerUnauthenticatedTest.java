package com.subscriptionmanager.controller;

import com.subscriptionmanager.config.SecurityConfig;
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
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Deliberately a separate top-level class from CatalogControllerTest, not a @Test method added
// there: that class carries a class-level @WithMockUser, and a single @Test method can't opt out
// of a class-level annotation. This class imports the real SecurityConfig but has NO
// @WithMockUser anywhere, so it proves the login gate actually protects a real *business*
// endpoint (not just /api/auth/me, which is the only other place a missing-session 401 is
// currently asserted). CatalogController is used (rather than e.g. ClientController) because all
// of its dependencies are repository *interfaces* — Mockito can mock those in this environment
// (JDK25/byte-buddy can't mock concrete classes here, see AppUserDetailsServiceTest and the
// @Import(SecurityConfig.class) additions to the other 5 @WebMvcTest classes), so this test can
// actually execute and prove the 401, not just test-compile it.
@WebMvcTest(CatalogController.class)
@Import({SecurityConfig.class, AppUserDetailsService.class})
class CatalogControllerUnauthenticatedTest {

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
    void listPlatformsWithoutAuthenticationReturnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/platforms"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").exists());
    }
}
