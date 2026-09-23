package com.subscriptionmanager.service;

import com.subscriptionmanager.entity.AppUser;
import com.subscriptionmanager.repository.AppUserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AppUserDetailsServiceTest {

    @Mock private AppUserRepository repository;

    private AppUserDetailsService service;

    @BeforeEach
    void setUp() {
        service = new AppUserDetailsService(repository);
    }

    @Test
    void loadUserByUsernameReturnsUserDetailsWhenFound() {
        AppUser appUser = new AppUser(1L, "ops", "hashed-password");
        when(repository.findByUsername("ops")).thenReturn(Optional.of(appUser));

        UserDetails userDetails = service.loadUserByUsername("ops");

        assertEquals("ops", userDetails.getUsername());
        assertEquals("hashed-password", userDetails.getPassword());
    }

    @Test
    void loadUserByUsernameThrowsWhenNotFound() {
        when(repository.findByUsername("unknown")).thenReturn(Optional.empty());

        assertThrows(UsernameNotFoundException.class, () -> service.loadUserByUsername("unknown"));
    }
}
