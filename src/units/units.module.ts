import { Global, Module } from '@nestjs/common';
import { UnitConverter } from './unit-converter.js';
import { DEFAULT_UNIT_REGISTRY } from './unit-registry.js';

@Global()
@Module({
  providers: [
    // Built from the same registry that request validation uses (single source).
    {
      provide: UnitConverter,
      useValue: new UnitConverter(DEFAULT_UNIT_REGISTRY),
    },
  ],
  exports: [UnitConverter],
})
export class UnitsModule {}
