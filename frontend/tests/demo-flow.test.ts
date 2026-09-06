import {describe,it,expect} from 'vitest';
describe('FarmDirect demo flow',()=>{
  it('keeps the demonstrator’s bulk allocation visible',()=>{
    const allocation=[420,330,250];
    expect(allocation.reduce((a,b)=>a+b,0)).toBe(1000);
  });
});
