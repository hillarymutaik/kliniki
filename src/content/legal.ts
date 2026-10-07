export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  subtitle: string;
  updated: string;
  sections: LegalSection[];
}

// These texts describe what Kliniki does today: records stay on the device, there are no accounts, no
// analytics and no server. If any of that changes (sync, sign-in, analytics), they must change with it.
// The clinic that runs Kliniki, not the app, is responsible for its patients' data, so both documents
// should be read by the clinic's own legal adviser before the app is used with real patient records.

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy policy',
  subtitle: 'How Kliniki handles patient and clinic information',
  updated: '1 October 2026',
  sections: [
    {
      heading: 'Who is responsible',
      paragraphs: [
        'Kliniki is a tool for running a clinic and pharmacy. The clinic that uses it decides what is recorded and why, and is responsible for that information. In the language of Kenya’s Data Protection Act, 2019, the clinic is the data controller.',
      ],
    },
    {
      heading: 'What Kliniki stores',
      paragraphs: [
        'Patients: name, phone number, date of birth, sex, SHA number and known allergies. This is health information, which the Act treats as sensitive personal data.',
        'Visits, bills (including M-Pesa confirmation codes), SHA claims, pharmacy stock and clinic settings.',
        'Your own name and role, if you choose to enter them, so the app can greet you.',
      ],
    },
    {
      heading: 'Where it is kept',
      paragraphs: [
        'Everything is stored on the device you are using. Kliniki has no accounts and does not send patient or clinic information to any server, and it contains no analytics or advertising.',
        'Because the information lives on the device, anyone who can unlock the device can open Kliniki. Use a screen lock, and do not leave the device unattended.',
        'Device backups, such as those made by Google or Apple, may include the app’s data depending on your device settings.',
      ],
    },
    {
      heading: 'Consent',
      paragraphs: [
        'Kliniki asks for confirmation that the patient consents to their health records being stored before a patient is registered. The clinic should keep to its own consent process alongside this.',
      ],
    },
    {
      heading: 'Your choices',
      paragraphs: [
        'Export all data (Settings, Privacy & data) copies everything stored on the device as text, so it can be backed up or given to a patient who asks for their records.',
        'Delete patient records removes every patient, visit, bill and claim from the device. This cannot be undone, so export first if you may need the records.',
        'Patients can ask the clinic to correct or delete their information. The clinic can edit a patient from the Patients section, or delete all patient records.',
      ],
    },
    {
      heading: 'Sharing',
      paragraphs: [
        'Kliniki does not share information. If the clinic exports data or copies the bills CSV, what happens to that copy is up to the clinic.',
      ],
    },
    {
      heading: 'Changes',
      paragraphs: [
        'If Kliniki later adds features that change how information is handled, such as syncing between devices, this policy will be updated first and the date above will change.',
      ],
    },
  ],
};

export const TERMS_OF_USE: LegalDocument = {
  title: 'Terms of use',
  subtitle: 'The ground rules for using Kliniki',
  updated: '1 October 2026',
  sections: [
    {
      heading: 'Using Kliniki',
      paragraphs: [
        'Kliniki helps a clinic keep track of its queue, patients, pharmacy stock, bills and SHA claims. By using it you agree to these terms on behalf of yourself and your clinic.',
      ],
    },
    {
      heading: 'Not medical advice',
      paragraphs: [
        'Kliniki records information; it does not diagnose, prescribe or give medical advice. Allergy notes and stock warnings are reminders. Clinical decisions stay with qualified staff, who must check allergies and drug details themselves.',
      ],
    },
    {
      heading: 'Accuracy of records',
      paragraphs: [
        'Staff are responsible for entering information correctly, including prices, quantities, batch numbers, expiry dates and payment references. Check bills and claims before relying on them or submitting them to SHA.',
        'Kliniki prepares claim records but does not submit them to SHA for you.',
      ],
    },
    {
      heading: 'Looking after patient information',
      paragraphs: [
        'Only use patient information for caring for patients and running the clinic. Keep the device locked, and do not share patient details with people who have no need for them.',
        'Follow your clinic’s policies and the laws that apply to it, including Kenya’s Data Protection Act, 2019.',
      ],
    },
    {
      heading: 'Your data and backups',
      paragraphs: [
        'Records are kept only on the device. If the device is lost, reset or broken, or the app is removed, the records can be lost. Export your data regularly and keep the copy somewhere safe.',
      ],
    },
    {
      heading: 'No warranty',
      paragraphs: [
        'Kliniki is provided as it is, without promises that it will always be available or free of mistakes, to the extent the law allows. The clinic remains responsible for its records and decisions.',
      ],
    },
    {
      heading: 'Changes to these terms',
      paragraphs: ['These terms may change as Kliniki does. The date above shows when they were last updated.'],
    },
  ],
};
