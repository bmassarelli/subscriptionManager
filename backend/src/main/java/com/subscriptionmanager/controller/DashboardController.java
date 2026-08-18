package com.subscriptionmanager.controller;

import com.subscriptionmanager.dto.DashboardSummaryDTO;
import com.subscriptionmanager.service.DashboardService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class DashboardController {

    private final DashboardService service;

    public DashboardController(DashboardService service) {
        this.service = service;
    }

    @GetMapping("/dashboard/summary")
    public DashboardSummaryDTO getSummary() {
        return service.getSummary();
    }
}
