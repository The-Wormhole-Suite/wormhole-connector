# Wormhole Connector Settings Backup Format

## Format identifier and version

Backups are UTF-8 JSON documents with the fixed identifier `wormhole-connector-settings` and schema version `2`.

Schema version `1` Pi-hole-only backups are accepted and migrated to Pi-hole connector descriptors during validation. Unknown versions remain rejected.

```json
{
  "format": "wormhole-connector-settings",
  "schemaVersion": 2,
  "exportedAt": "2026-08-04T12:00:00.000Z",
  "settings": {
    "general": {
      "hideGroupSelectorInPopup": false,
      "hideGroupListActionsInPopup": false,
      "badgeUsesSelectedGroup": false,
      "reloadAfterDisable": true,
      "reloadAfterWhitelist": true,
      "hideGlobalListActions": false,
      "disableContextMenu": false
    },
    "timers": {
      "defaultDisableTime": 10,
      "groupPauseTimes": [60, 300, 900],
      "temporaryAllowTimes": [60, 300, 900]
    },
    "group": {
      "selectedGroup": "Children"
    },
    "addresses": {
      "connectors": [
        {"type": "pihole", "address": "https://pi.example.net/pihole/admin"},
        {"type": "adguard-home", "address": "https://dns.example.net/adguard"}
      ]
    }
  }
}
```

## Validation

The importer rejects:

- unknown formats or schema versions;
- missing or unknown fields;
- unsupported backend types and non-HTTP(S) or malformed connector URLs;
- URLs containing embedded credentials, a query, or a fragment;
- duplicate backend/address pairs or more than four connectors;
- timer arrays that do not contain exactly three integers of at least 10 seconds;
- malformed booleans, dates, or scope values;
- files larger than 1 MiB.

The settings are shown in an import preview and are not applied until the user selects the explicit apply action.

## Deliberately excluded data

The format cannot contain:

- usernames, passwords, or application passwords for either backend;
- API session IDs or CSRF values;
- temporary-domain recovery records;
- scope-pause recovery records;
- browser alarms;
- browser-sync opt-in choices.

When an imported backend type and address match a locally configured connector, its existing local username and password are retained. New connectors receive empty local credentials and must be completed by the user.

## Browser synchronization

Browser sync uses the same validated category payloads in four separate versioned entries: `general`, `timers`, `group`, and `addresses`. Every category is opt-in and off by default. Disabling a category removes its synchronized entry. Connector synchronization includes only backend types and addresses, never usernames or passwords.
