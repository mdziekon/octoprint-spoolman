# octoprint-spoolman

An OctoPrint plugin integrating with [Spoolman](https://github.com/Donkie/Spoolman/), a universal filament spools inventory manager.

## Features

- [x] Basic Spoolman integration
    - [x] Connect to configured Spoolman
    - [x] Display available spools
    - [x] Select & deselect spools for specified tools / extruders
    - [x] Commit spools usage to Spoolman
- [ ] Spools filtering
- [ ] Check spools before starting a print
    - [ ] Warn when no spools are selected
    - [ ] Warn when selected spools do not have enough material
    - [ ] Warn when wrong spool material has been selected (PrusaSlicer / OrcaSlicer gcodes)

## Development

You can use `docker compose` to start a development server, consisting of a test OctoPrint & Spoolman instances.

```bash
docker compose up
```

### Setup

On initial spin-up, you'll need to manually change permissions of the Spoolman directory:

```bash
# While in root directory of the project...
sudo chown 1000:1000 ./docker-data/spoolman
```

On first setup, you should configure your test Octoprint & Spoolman instances.

For Octoprint, there's currently no backup & restore method (problems with dockerized Octoprint not allowing to restore from backup), so you'll have to configure your instance manually (once).

For Spoolman, there's currently no backup & restore method, so you'll have to create spools manually.

### Development

- Octoprint should be available at `localhost:7180`
- Spoolman should be available at `localhost:7181`

After applying any changes, restart the Octoprint server so that it picks up your changes.
