# Firestore Schema — PotatoLink Fieldwork

## Design principle

Control-plus-multiple-arms pattern. One trial has one control arm and N alternative arms.
All economic calculations compare each alternative arm against the control arm.
The schema is project-agnostic: new trial types only require new FormTemplate configs,
not schema changes.

## Collections

### projects
```
{
  projectId: string (auto),
  name: string,
  funder: string,
  startDate: timestamp,
  endDate: timestamp,
  status: "active" | "completed" | "archived",
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### trials
```
{
  trialId: string (auto),
  projectId: string (ref: projects),
  name: string,
  objective: string,
  status: "draft" | "active" | "completed" | "archived",
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### sites
```
{
  siteId: string (auto),
  trialId: string (ref: trials),
  contactId: string (ref: contacts),
  location: string,
  region: string,
  soilType: string,
  coordinates: { lat: number, lng: number } | null,
  createdAt: timestamp
}
```

### practiceArms
```
{
  armId: string (auto),
  trialId: string (ref: trials),
  name: string,
  type: "control" | "alternative",
  description: string,
  sortOrder: number,
  createdAt: timestamp
}
```

### armAssumptions
```
{
  assumptionId: string (auto),
  armId: string (ref: practiceArms),
  category: "capex" | "opex" | "labour" | "revenue" | "other",
  fieldName: string,
  value: number | string,
  unit: string,
  createdAt: timestamp
}
```

### measurementEvents
```
{
  eventId: string (auto),
  siteId: string (ref: sites),
  armId: string (ref: practiceArms),
  eventDate: timestamp,
  eventType: string,
  enteredBy: string (ref: contacts),
  syncStatus: "pending" | "synced" | "error",
  createdAt: timestamp
}
```

### metrics
```
{
  metricId: string (auto),
  eventId: string (ref: measurementEvents),
  metricName: string,
  value: number | string,
  unit: string,
  photoUrl: string | null,
  createdAt: timestamp
}
```

### economicScenarios
```
{
  scenarioId: string (auto),
  trialId: string (ref: trials),
  name: string,
  assumptionsJson: string,
  createdAt: timestamp
}
```

### resultSets
```
{
  resultId: string (auto),
  scenarioId: string (ref: economicScenarios),
  armId: string (ref: practiceArms),
  netBenefit: number,
  paybackPeriod: number | null,
  notes: string,
  calculatedAt: timestamp
}
```

### contacts
```
{
  contactId: string (auto),
  name: string,
  business: string,
  role: "grower" | "staff" | "cooperator" | "vendor",
  region: string,
  email: string,
  phone: string,
  tags: string[],
  createdAt: timestamp
}
```

### adoptionFollowups
```
{
  followupId: string (auto),
  trialId: string (ref: trials),
  contactId: string (ref: contacts),
  adoptionStatus: "not_started" | "considering" | "trialling" | "adopted" | "rejected",
  behaviourNotes: string,
  followupDate: timestamp,
  createdAt: timestamp
}
```

### formTemplates
```
{
  templateId: string (auto),
  trialId: string (ref: trials),
  armId: string (ref: practiceArms),
  name: string,
  fields: Array<{
    fieldName: string,
    label: string,
    type: "number" | "text" | "select" | "slider" | "photo" | "date" | "boolean",
    required: boolean,
    options: string[] | null,
    min: number | null,
    max: number | null,
    unit: string | null,
    displayOrder: number
  }>,
  createdAt: timestamp
}
```

### dataEntryLogs
```
{
  entryId: string (auto),
  eventId: string (ref: measurementEvents),
  enteredBy: string (ref: contacts),
  entryDate: timestamp,
  deviceType: "mobile" | "tablet" | "desktop",
  syncStatus: "pending" | "synced" | "error",
  createdAt: timestamp
}
```

## Indexes required

- trials: projectId + status
- practiceArms: trialId + type
- measurementEvents: siteId + eventDate
- measurementEvents: armId + eventDate
- metrics: eventId + metricName
- contacts: email (unique)
- formTemplates: trialId + armId
