// The plan's last age: Partner A's age plus the projection's years

  // The plan's last age L: runProjection's loop runs `year <= projectionYears`, with projectionYears the longer
  // life-expectancy gap (partner A's alone for a single person), so L = ageA + projectionYears.
  export function planLastAge(inputs) {
    const ageA = inputs.ageA;
    return (
      ageA +
      (inputs.singlePerson
        ? Math.max(0, inputs.lifeExpectancyA - ageA)
        : Math.max(0, inputs.lifeExpectancyA - ageA, inputs.lifeExpectancyB - inputs.ageB))
    );
  }
