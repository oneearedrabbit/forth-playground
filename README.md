# forth-playground

Forth experiments.

forth00.js -- bootstrapping Forth. VARIABLE, ARRAY, CREATE/DOES>, IF, BEGIN, AGAIN, VALUE/DEFER, and stuff. Butchered, Ruby-like syntax:
```
DEF COUNTER
  CREATE ,
  RETURN DUP 1 SWAP +! @
END
0 COUNTER AUTOPK
AUTOPK PUTS  # => 1
AUTOPK PUTS  # => 2

DEF DIP SWAP >R EXECUTE R> END
3 2 { 7 * } DIP PRINT SPACE PUTS  # => (in the order of print/puts) 2 3 7 * = 2 21

DEF TIMES
  BEGIN
    OVER EXECUTE
  1 - DUP ZERO? UNTIL
  2DROP
END
{ DUP PRINT SPACE } 5 TIMES CR  # => 5 4 3 2 1

HERE 113 , 127 , 2 VECTOR CONST VECTOR3
{ PRINT SPACE } VECTOR3 EACH CR  # => 127 113

DEF Q1 { 2 4 * } END
Q1 EXECUTE PUTS  # => 8
```
