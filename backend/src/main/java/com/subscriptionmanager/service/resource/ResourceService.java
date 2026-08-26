package com.subscriptionmanager.service.resource;

import com.subscriptionmanager.dto.ResourceDTO;
import com.subscriptionmanager.dto.ResourceRequestDTO;
import com.subscriptionmanager.entity.Resource;
import com.subscriptionmanager.entity.Subscription;
import com.subscriptionmanager.repository.ResourceRepository;
import com.subscriptionmanager.repository.SubscriptionRepository;
import com.subscriptionmanager.service.lifecycle.SubscriptionNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class ResourceService {

    private static final Set<String> VALID_TYPES = Set.of(
            "IP", "VLAN", "CPE", "PORT", "EQUIPMENT", "NODE");

    private final SubscriptionRepository subscriptionRepository;
    private final ResourceRepository resourceRepository;

    public ResourceService(SubscriptionRepository subscriptionRepository, ResourceRepository resourceRepository) {
        this.subscriptionRepository = subscriptionRepository;
        this.resourceRepository = resourceRepository;
    }

    public List<ResourceDTO> getResources(Long subscriptionId) {
        requireSubscription(subscriptionId);
        return resourceRepository.findByService_Subscription_IdOrderByIdAsc(subscriptionId)
                .stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    public ResourceDTO addResource(Long subscriptionId, ResourceRequestDTO request) {
        Subscription subscription = requireSubscription(subscriptionId);

        if (!VALID_TYPES.contains(request.getResourceType())) {
            throw new InvalidResourceTypeException(
                    "resourceType must be one of " + VALID_TYPES);
        }

        Resource resource = new Resource(subscription.getService(), request.getResourceType(), request.getValue());
        return toDTO(resourceRepository.save(resource));
    }

    public void deleteResource(Long subscriptionId, Long resourceId) {
        requireSubscription(subscriptionId);
        Resource resource = resourceRepository.findById(resourceId)
                .filter(r -> r.getService().getSubscription().getId().equals(subscriptionId))
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No resource exists with id " + resourceId + " for subscription " + subscriptionId));
        resourceRepository.delete(resource);
    }

    private Subscription requireSubscription(Long subscriptionId) {
        return subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new SubscriptionNotFoundException(
                        "No subscription exists with id " + subscriptionId));
    }

    private ResourceDTO toDTO(Resource resource) {
        return new ResourceDTO(
                resource.getId(),
                resource.getService().getSubscription().getId(),
                resource.getResourceType(),
                resource.getValue());
    }
}
