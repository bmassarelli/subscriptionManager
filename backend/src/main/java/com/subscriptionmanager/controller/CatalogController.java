package com.subscriptionmanager.controller;

import com.subscriptionmanager.dto.PaymentModeDTO;
import com.subscriptionmanager.dto.PlatformDTO;
import com.subscriptionmanager.dto.ProductOfferingDTO;
import com.subscriptionmanager.repository.PaymentModeRepository;
import com.subscriptionmanager.repository.PlatformRepository;
import com.subscriptionmanager.repository.ProductOfferingRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class CatalogController {

    private final PlatformRepository platformRepository;
    private final PaymentModeRepository paymentModeRepository;
    private final ProductOfferingRepository productOfferingRepository;

    public CatalogController(PlatformRepository platformRepository, PaymentModeRepository paymentModeRepository,
                              ProductOfferingRepository productOfferingRepository) {
        this.platformRepository = platformRepository;
        this.paymentModeRepository = paymentModeRepository;
        this.productOfferingRepository = productOfferingRepository;
    }

    @GetMapping("/platforms")
    public List<PlatformDTO> getPlatforms() {
        return platformRepository.findAll()
                .stream()
                .map(p -> new PlatformDTO(p.getId(), p.getName()))
                .toList();
    }

    @GetMapping("/payment-modes")
    public List<PaymentModeDTO> getPaymentModes() {
        return paymentModeRepository.findAll()
                .stream()
                .map(p -> new PaymentModeDTO(p.getId(), p.getName()))
                .toList();
    }

    @GetMapping("/product-offerings")
    public List<ProductOfferingDTO> getProductOfferings() {
        return productOfferingRepository.findAll()
                .stream()
                .map(p -> new ProductOfferingDTO(p.getId(), p.getName()))
                .toList();
    }
}
