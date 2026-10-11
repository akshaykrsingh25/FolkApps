import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProximityFeedback, ProximityProcessor } from './proximity';
afterEach(()=>vi.useRealTimers());
describe('proximity signal',()=>{
  it('isolates target, rejects malformed and out of order samples',()=>{
    const p=new ProximityProcessor('ABCD');
    expect(p.accept('other',-50,0)).toBeNull();
    for(const value of [NaN,Infinity,0,-128])expect(p.accept('ABCD',value,0)).toBeNull();
    expect(p.accept('abcd',-80,100)?.rssi).toBe(-80);
    expect(p.accept('ABCD',-20,99)).toBeNull();
    expect(p.read(100)?.rssi).toBe(-80);
  });
  it('smooths, expires, resets and bounds cadence',()=>{
    const p=new ProximityProcessor('ABCD');
    p.accept('ABCD',-80,0);
    expect(p.accept('ABCD',-60,100)?.rssi).toBe(-73);
    expect(p.read(3100)).toBeNull();
    expect(p.accept('ABCD',-10,3200)?.intervalMs).toBe(200);
    p.reset();expect(p.read(3200)).toBeNull();
  });
  it('validates configuration',()=>{expect(()=>new ProximityProcessor('')).toThrow();expect(()=>new ProximityProcessor('a',0)).toThrow();});
  it('does not create duplicate loops or pulse after stop or signal loss',()=>{
    vi.useFakeTimers();vi.setSystemTime(0);
    const p=new ProximityProcessor('ABCD');const pulse=vi.fn();const loop=new ProximityFeedback(()=>p.read(),pulse);
    loop.start();loop.start();expect(pulse).not.toHaveBeenCalled();
    p.accept('ABCD',-50);vi.advanceTimersByTime(500);expect(pulse).toHaveBeenCalled();
    vi.advanceTimersByTime(3500);const count=pulse.mock.calls.length;vi.advanceTimersByTime(4000);expect(pulse).toHaveBeenCalledTimes(count);
    loop.stop();p.accept('ABCD',-20);vi.advanceTimersByTime(4000);expect(pulse).toHaveBeenCalledTimes(count);
  });
});
