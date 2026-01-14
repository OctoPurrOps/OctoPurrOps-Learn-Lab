# Retro Learn Lab

Little retro arcade lab where you can:
- drive a CAR / swim a FISH / fly a DRONE
- record your moves, then let the bot copy you (imitation learning)
- do RL for the fish (policy gradient vibes)
- open 2 tabs and mess around with “rooms” (multi-tab sync)

### Quick local server
- Python:
  - `python -m http.server 8000`
  - open: http://localhost:8000

## Controls
Arrow keys:
- ↑ / ↓ = gas / brake (or thrust)
- ← / → = steer / turn / tilt

## Training (IMI)
1. Start REC
2. Drive around for like 300+ samples
3. Train (IMI)
4. Turn AUTO on

## Saving
Models save to your browser via IndexedDB (so refreshing won’t delete it).  
If you clear site data, it’s gone.

## Credits
Made by OctoPurrOps — https://github.com/OctoPurrOps
