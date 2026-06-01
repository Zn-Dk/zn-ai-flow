import { IsString, IsInt, Min, IsBoolean } from 'class-validator';

export class CreateDemoDto {
  @IsString()
  name: string;

  // '25' -> 25
  @IsInt()
  @Min(1)
  age: number;

  // '1' / 'true' -> true
  // '0' / 'false' -> false
  @IsBoolean()
  bool: boolean;
}
