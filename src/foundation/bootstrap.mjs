import { createFoundationRepository } from './repository.mjs?v=foundation-20261003-9';
import { createMohitOsActions } from './actions.mjs?v=os-v1-20261003-3';

const foundationRepository = createFoundationRepository();

window.MOHIT_OS_FOUNDATION_READY = foundationRepository.open()
  .then(() => foundationRepository)
  .catch(error => {
    console.warn('MOHIT.OS Foundation storage is unavailable; the A2Z tracker will continue normally.', error);
    return null;
  });

window.MOHIT_OS_ACTIONS_READY = window.MOHIT_OS_FOUNDATION_READY
  .then(repository => repository ? createMohitOsActions(repository) : null);
