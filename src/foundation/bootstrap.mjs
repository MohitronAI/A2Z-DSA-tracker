import { createFoundationRepository } from './repository.mjs?v=foundation-20261003-5';

const foundationRepository = createFoundationRepository();

window.MOHIT_OS_FOUNDATION_READY = foundationRepository.open()
  .then(() => foundationRepository)
  .catch(error => {
    console.warn('MOHIT.OS Foundation storage is unavailable; the A2Z tracker will continue normally.', error);
    return null;
  });
