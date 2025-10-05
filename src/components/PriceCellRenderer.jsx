import { useEffect, useState, memo } from 'react';

export const PriceCellRenderer = memo((props) => {
  const [prevValue, setPrevValue] = useState(props.value);
  const [flashClass, setFlashClass] = useState('');

  useEffect(() => {
    if (props.value !== prevValue) {
      const direction = props.value > prevValue ? 'up' : 'down';
      setFlashClass(`price-${direction}`);
      setPrevValue(props.value);

      // Clear flash after animation
      const timer = setTimeout(() => setFlashClass(''), 500);
      return () => clearTimeout(timer);
    }
  }, [props.value, prevValue]);

  return (
    <div className={flashClass}>
      ${props.value?.toFixed(2) || '0.00'}
    </div>
  );
});
