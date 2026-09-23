package com.subscriptionmanager.service;

import com.subscriptionmanager.dto.SubscriptionDTO;
import com.subscriptionmanager.dto.SubscriptionDetailDTO;
import com.subscriptionmanager.dto.SubscriptionRequestDTO;
import com.subscriptionmanager.dto.SubscriptionUpdateDTO;
import com.subscriptionmanager.dto.ServiceDTO;
import com.subscriptionmanager.entity.Client;
import com.subscriptionmanager.entity.PaymentMode;
import com.subscriptionmanager.entity.ProductOffering;
import com.subscriptionmanager.entity.Subscription;
import com.subscriptionmanager.repository.ClientRepository;
import com.subscriptionmanager.repository.PaymentModeRepository;
import com.subscriptionmanager.repository.PlatformRepository;
import com.subscriptionmanager.repository.ProductOfferingRepository;
import com.subscriptionmanager.repository.SubscriptionRepository;
import com.subscriptionmanager.service.lifecycle.LifecycleActionRegistry;
import com.subscriptionmanager.service.lifecycle.SubscriptionNotFoundException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class SubscriptionService {

    private final SubscriptionRepository repository;
    private final ClientRepository clientRepository;
    private final PlatformRepository platformRepository;
    private final PaymentModeRepository paymentModeRepository;
    private final ProductOfferingRepository productOfferingRepository;
    private final OperationRecorder operationRecorder;
    private final LifecycleActionRegistry actionRegistry;

    public SubscriptionService(SubscriptionRepository repository, ClientRepository clientRepository,
                                PlatformRepository platformRepository, PaymentModeRepository paymentModeRepository,
                                ProductOfferingRepository productOfferingRepository,
                                OperationRecorder operationRecorder, LifecycleActionRegistry actionRegistry) {
        this.repository = repository;
        this.clientRepository = clientRepository;
        this.platformRepository = platformRepository;
        this.paymentModeRepository = paymentModeRepository;
        this.productOfferingRepository = productOfferingRepository;
        this.operationRecorder = operationRecorder;
        this.actionRegistry = actionRegistry;
    }

    public List<SubscriptionDTO> getAll() {
        return repository.findAllWithClient()
                .stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    public SubscriptionDTO create(SubscriptionRequestDTO request) {
        Client client = clientRepository.findById(request.getClientId())
                .orElseThrow(() -> new InvalidClientReferenceException(
                        "No client exists with id " + request.getClientId()));

        platformRepository.findByName(request.getPlatform())
                .orElseThrow(() -> new InvalidPlatformException(
                        "No platform exists with name " + request.getPlatform()));

        Subscription subscription = new Subscription(null, client,
                request.getContract(), "TR", LocalDate.now(), request.getAmount());

        com.subscriptionmanager.entity.Service service =
                new com.subscriptionmanager.entity.Service(subscription, request.getPlatform(), null, null);
        subscription.setService(service);
        service.setSubscription(subscription);

        if (request.getPaymentModeId() != null) {
            PaymentMode paymentMode = paymentModeRepository.findById(request.getPaymentModeId())
                    .orElseThrow(() -> new InvalidPaymentModeException(
                            "No payment mode exists with id " + request.getPaymentModeId()));
            subscription.setPaymentMode(paymentMode);
        }

        if (request.getPo() != null && !request.getPo().isBlank()) {
            ProductOffering productOffering = productOfferingRepository.findByName(request.getPo())
                    .orElseThrow(() -> new InvalidProductOfferingException(
                            "No product offering exists with name " + request.getPo()));
            subscription.setProductOffering(productOffering);
        }

        Subscription saved = repository.save(subscription);
        operationRecorder.record(saved, "CREATE", "COMPLETED", null, "Subscription created", null);
        return toDTO(saved);
    }

    public SubscriptionDetailDTO getById(Long id) {
        Subscription s = repository.findById(id)
                .orElseThrow(() -> new SubscriptionNotFoundException("No subscription exists with id " + id));

        List<String> availableProductActions = actionRegistry.availableProductActionsFor(s.getStatus());
        List<String> availableServiceActions = actionRegistry.availableServiceActionsFor(s.getStatus());
        String clientName = s.getClient().getName() + " " + s.getClient().getLastName();

        return new SubscriptionDetailDTO(
                s.getId(),
                clientName,
                s.getClient().getEmail(),
                s.getClient().getMsisdn(),
                s.getService().getPlatform(),
                s.getContract(),
                s.getProductOffering() == null ? null : s.getProductOffering().getName(),
                s.getPaymentMode() == null ? null : s.getPaymentMode().getName(),
                s.getStatus(),
                s.getEntryDate(),
                s.getActivateDate(),
                s.getDeactivateDate(),
                s.getCancelDate(),
                s.getStartTrialDate(),
                s.getEndTrialDate(),
                s.getAmount(),
                s.getService().getMsisdn(),
                s.getService().getSimIccid(),
                new ServiceDTO(s.getService().getPlatform(), s.getService().getMsisdn(), s.getService().getSimIccid()),
                availableProductActions,
                availableServiceActions
        );
    }

    public SubscriptionDTO update(Long id, SubscriptionUpdateDTO request) {
        Subscription subscription = repository.findById(id)
                .orElseThrow(() -> new SubscriptionNotFoundException("No subscription exists with id " + id));

        subscription.setContract(request.getContract());
        subscription.setAmount(request.getAmount());

        Subscription saved = repository.save(subscription);
        return toDTO(saved);
    }

    public SubscriptionDTO toDTO(Subscription s) {
        String clientName = s.getClient().getName() + " " + s.getClient().getLastName();
        return new SubscriptionDTO(
                s.getId(),
                clientName,
                s.getClient().getEmail(),
                s.getClient().getMsisdn(),
                s.getService().getPlatform(),
                s.getContract(),
                s.getStatus(),
                s.getEntryDate(),
                s.getAmount(),
                s.getProductOffering() == null ? null : s.getProductOffering().getName()
        );
    }
}
