package com.subscriptionmanager.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.subscriptionmanager.config.SecurityConfig;
import com.subscriptionmanager.entity.AppUser;
import com.subscriptionmanager.repository.AppUserRepository;
import com.subscriptionmanager.service.AppUserDetailsService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;
import java.util.Optional;

import static org.hamcrest.Matchers.notNullValue;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// AppUserDetailsService is imported as a REAL bean (not @MockBean) because Mockito's inline
// mock maker cannot instrument concrete classes under this environment's JDK25/byte-buddy
// combination (see AppUserDetailsServiceTest's plain-Mockito test and the pre-existing
// ClientControllerTest, which hits the identical "Mockito cannot mock this class" failure).
// Only the AppUserRepository *interface* is mocked, which Mockito can still proxy — this lets
// AuthController be backed by a real AuthenticationManager/PasswordEncoder/AppUserDetailsService
// chain and lets this test actually execute in this environment.
@WebMvcTest(AuthController.class)
@Import({SecurityConfig.class, AppUserDetailsService.class})
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @MockBean
    private AppUserRepository appUserRepository;

    private String loginBody(String username, String password) throws Exception {
        return objectMapper.writeValueAsString(Map.of("username", username, "password", password));
    }

    private void stubKnownUser(String username, String rawPassword) {
        AppUser appUser = new AppUser(1L, username, passwordEncoder.encode(rawPassword));
        when(appUserRepository.findByUsername(username)).thenReturn(Optional.of(appUser));
    }

    // NOTE: MockMvc never runs inside a real servlet container, so it never simulates a
    // container writing a "Set-Cookie: JSESSIONID=..." response header — that translation from
    // "a session was created" to "a cookie was issued" is normally the servlet container's job
    // (e.g. Tomcat), not something MockHttpServletResponse does on its own. Asserting on that
    // header here would test MockMvc's plumbing, not AuthController. What actually matters —
    // and what the reuse tests below rely on and prove — is that the login request creates a
    // session and stores the authenticated SecurityContext in it, which is the real mechanism
    // that makes a subsequent request (with that session) come back authenticated.
    @Test
    void validLoginReturnsOkAndPersistsSecurityContextInSession() throws Exception {
        stubKnownUser("gooduser", "password123");

        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content(loginBody("gooduser", "password123")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("gooduser"))
                .andExpect(request().sessionAttribute("SPRING_SECURITY_CONTEXT", notNullValue()));
    }

    @Test
    void loginWithWrongPasswordReturnsUnauthorized() throws Exception {
        stubKnownUser("gooduser", "password123");

        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content(loginBody("gooduser", "wrongpassword")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void loginWithUnknownUsernameReturnsUnauthorized() throws Exception {
        when(appUserRepository.findByUsername("unknownuser")).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content(loginBody("unknownuser", "password123")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void meWithoutPriorLoginReturnsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void meWithSessionFromPriorLoginReturnsUsername() throws Exception {
        stubKnownUser("gooduser", "password123");

        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content(loginBody("gooduser", "password123")))
                .andExpect(status().isOk())
                .andReturn();

        MockHttpSession session = (MockHttpSession) loginResult.getRequest().getSession(false);

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("gooduser"));
    }

    @Test
    void logoutInvalidatesSessionSoSubsequentMeIsUnauthorized() throws Exception {
        stubKnownUser("gooduser", "password123");

        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content(loginBody("gooduser", "password123")))
                .andExpect(status().isOk())
                .andReturn();

        MockHttpSession session = (MockHttpSession) loginResult.getRequest().getSession(false);

        mockMvc.perform(post("/api/auth/logout").session(session))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isUnauthorized());
    }
}
