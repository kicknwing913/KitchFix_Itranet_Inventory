const form = document.getElementById('personnel-form');
const successMessage = document.getElementById('success-message');
const errorMessage = document.getElementById('error-message');
const actionError = document.querySelector('[data-error-for="actionItems"]');
const startSubmissionBtn = document.getElementById('start-submission');
const formCard = document.getElementById('personnel-form-card');
const separationSection = document.getElementById('separation-details');
const separationReason = document.getElementById('separationReason');
const lastDayInput = document.getElementById('lastDay');
const eligibleRehireInputs = document.querySelectorAll('input[name="eligibleRehire"]');
const locationSelect = document.getElementById('location');
const emailInput = document.getElementById('email');

const getFormData = () => {
  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());
  const actionItems = data.getAll('actionItems');
  const eligibleRehire = data.getAll('eligibleRehire');
  return {
    ...payload,
    actionItems,
    eligibleRehire: eligibleRehire.length ? eligibleRehire[0] : undefined
  };
};

const clearMessages = () => {
  successMessage.hidden = true;
  errorMessage.hidden = true;
  actionError.textContent = '';
};

const showError = (message) => {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
};

const validateSeparation = (payload) => {
  const errors = [];
  if (!payload.separationReason) {
    errors.push('Select a separation reason.');
  }
  if (!payload.lastDay) {
    errors.push("Enter the employee's last day of actual work.");
  }
  if (!payload.eligibleRehire) {
    errors.push('Select eligibility for re-hire.');
  }
  return errors;
};

const validateForm = () => {
  const payload = getFormData();
  if (!payload.name || !payload.location) {
    showError('Name and location are required.');
    return false;
  }
  if (!payload.actionItems || payload.actionItems.length === 0) {
    actionError.textContent = 'Please select at least one action item.';
    showError('Action item is required.');
    return false;
  }
  if (payload.actionItems.includes('Separation')) {
    const separationErrors = validateSeparation(payload);
    if (separationErrors.length) {
      showError(separationErrors.join(' '));
      return false;
    }
  }
  return true;
};

const toggleSeparationFields = () => {
  const payload = getFormData();
  const shouldShow = payload.actionItems.includes('Separation');
  separationSection.hidden = !shouldShow;
  separationSection.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');

  if (!shouldShow) {
    separationReason.value = '';
    lastDayInput.value = '';
    eligibleRehireInputs.forEach((input) => {
      input.checked = false;
    });
  }
};

const animateFormCard = () => {
  formCard.classList.add('highlight');
  setTimeout(() => formCard.classList.remove('highlight'), 700);
};

startSubmissionBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  document.getElementById('personnel-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  animateFormCard();
});

const fetchLocations = async () => {
  try {
    const response = await fetch('/api/locations');
    if (!response.ok) throw new Error('Unable to load locations.');
    const locations = await response.json();
    locationSelect.innerHTML = '<option value="">Select a location</option>';
    locations.forEach(({ value, label }) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      locationSelect.appendChild(option);
    });
  } catch (error) {
    locationSelect.innerHTML = '<option value="">Locations unavailable</option>';
    console.error(error);
  }
};

const prefillEmail = async () => {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) return;
    const { email } = await response.json();
    if (email && !emailInput.value) {
      emailInput.value = email;
    }
  } catch (error) {
    console.warn('Unable to prefill email', error);
  }
};

form.addEventListener('change', (event) => {
  if (event.target.name === 'actionItems') {
    toggleSeparationFields();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessages();

  if (!validateForm()) {
    return;
  }

  const payload = getFormData();

  try {
    const response = await fetch('/api/personnel-actions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.errors ? body.errors.join(', ') : body.error);
    }

    successMessage.hidden = false;
    form.reset();
    toggleSeparationFields();
  } catch (error) {
    showError(error.message || 'Unable to submit.');
  }
});

fetchLocations();
prefillEmail();
