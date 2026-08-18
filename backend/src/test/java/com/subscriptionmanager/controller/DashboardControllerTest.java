package com.subscriptionmanager.controller;

import com.subscriptionmanager.dto.DashboardSummaryDTO;
import com.subscriptionmanager.service.DashboardService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(DashboardController.class)
class DashboardControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private DashboardService service;

    @Test
    void returnsTheDashboardSummary() throws Exception {
        Map<String, Long> statusCounts = Map.of("AC", 1L, "TR", 0L, "SU", 0L, "EX", 0L, "CA", 0L, "ER", 0L);
        when(service.getSummary()).thenReturn(new DashboardSummaryDTO(
                2L, 3L, statusCounts, List.of(), Map.of("CREATE", 3L)));

        mockMvc.perform(get("/api/dashboard/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clientCount").value(2))
                .andExpect(jsonPath("$.subscriptionCount").value(3))
                .andExpect(jsonPath("$.statusCounts.AC").value(1))
                .andExpect(jsonPath("$.operationTypeCounts.CREATE").value(3));
    }

    @Test
    void returnsZeroFiguresWhenNoDataExists() throws Exception {
        Map<String, Long> statusCounts = Map.of("AC", 0L, "TR", 0L, "SU", 0L, "EX", 0L, "CA", 0L, "ER", 0L);
        when(service.getSummary()).thenReturn(new DashboardSummaryDTO(
                0L, 0L, statusCounts, List.of(), Map.of()));

        mockMvc.perform(get("/api/dashboard/summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clientCount").value(0))
                .andExpect(jsonPath("$.recentOperations.length()").value(0));
    }
}
